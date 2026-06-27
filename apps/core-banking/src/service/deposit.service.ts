import * as z from "zod";
import { ServiceResult } from "../utils/types";
import { generateReference } from "../utils/reference.utils";
import { findeWalletByUserIdForUpdate } from "../data-access-layer-core/wallet.data-access-layer";

import { findIdempotencyKey, insertIdempotencyKey } from "../data-access-layer-core/idempotency.data-access-layer";
import { publishEvent } from "../settings/rabbitQ.config";
import { serverLogger } from "../settings/pino.config";
import { db } from "../settings/db.config";
import { ledger, transactions, wallets } from "../database/schema";
import { and, eq } from "drizzle-orm";
import { updateTransactionStatus } from "../data-access-layer-core/transaction.data-access-layer";

// ─────────────────────────────────────────────────────────────
// DEPOSIT SERVICE
// Handles funding a user's wallet — validates input, updates
// balance atomically, creates transaction + ledger records,
// and publishes events via RabbitMQ.
// ─────────────────────────────────────────────────────────────

const DepositSchema = z.object({
    userId: z.string().uuid("Invalid user ID"),
    amount: z
        .number({ error: "Amount is required" })
        .positive("Amount must be greater than zero")
        .max(10_000_000, "Single deposit cannot exceed 10,000,000"),
    narration: z.string().max(255).optional().default("Wallet funding"),
    idempotencyKey: z.string().optional(),
});

type DepositInput = z.infer<typeof DepositSchema>;

interface DepositSuccessPayload {
    transaction: {
        id: string;
        reference: string;
        amount: string;
        balanceBefore: string;
        balanceAfter: string;
        type: string;
        category: string;
        status: string;
        narration: string | null;
        createdAt: Date;
    };
    wallet: {
        id: string;
        newBalance: string;
    };
}

export const deposit_service = async (
    data: unknown
): Promise<ServiceResult<DepositSuccessPayload>> => {
    const depositLogger = serverLogger.child({ service: "deposit" });

    // 1. Validate input
    const parsed = DepositSchema.safeParse(data);
    if (!parsed.success) {
        return {
            success: false,
            error: "Validation failed",
            details: parsed.error.flatten().fieldErrors,
        };
    }

    const { userId, amount, narration, idempotencyKey } = parsed.data;

    // 2. Check idempotency (prevent duplicate deposits)
    if (idempotencyKey) {
        const existing = await findIdempotencyKey(idempotencyKey);
        if (existing) {
            return {
                success: false,
                error: "Duplicate request",
                details: "This transaction has already been processed.",
            };
        }
    }

    // 3. Find the user's wallet
    const wallet = await findeWalletByUserIdForUpdate(userId);
    if (!wallet) {
        return {
            success: false,
            error: "Wallet not found",
            details: "No wallet found for this user. Please create a wallet first.",
        };
    }

    // 4. Calculate new balance
    const balanceBefore = wallet.balance;
    const balanceAfter = (
        parseFloat(balanceBefore) + amount
    ).toFixed(4);

    const reference = generateReference("FUND");

    try {
        // 5. Create the transaction record (status: pending)

        const DepositTnx = await db.transaction(async (tx) => {


            const [tnx] = await tx.insert(transactions).values({
                reference,
                walletId: wallet.id,
                amount: amount.toFixed(4),
                balanceBefore,
                balanceAfter,
                type: "credit",
                category: "funding",
                narration: narration || "Wallet funding",
                status: "pending",
            }).returning()

            await tx.insert(ledger).values({
                txnId: tnx.id,
                walletId: wallet.id,
                type: "credit",
                amount: amount.toFixed(4),
            })

            await tx.update(wallets).set({ balance: balanceAfter }).where(eq(wallets.userId, userId))

            await tx.update(transactions).set({
                status: "completed"
            }).where(eq(transactions.id, tnx.id))

            return {
                success: true,
                data: {
                    transaction: {
                        id: tnx.id,
                        reference: tnx.reference,
                        amount: tnx.amount,
                        balanceBefore: tnx.balanceBefore,
                        balanceAfter: tnx.balanceAfter,
                        type: tnx.type,
                        category: tnx.category,
                        status: tnx.status,
                        narration: tnx.narration,
                        createdAt: tnx.createdAt,
                    },
                    wallet: {
                        id: wallet.id,
                        newBalance: balanceAfter,
                    },
                },
            };

        })
        // 9. Save idempotency key
        if (idempotencyKey) {
            await insertIdempotencyKey(idempotencyKey, DepositTnx.data.transaction.id);
        }

        // 10. Publish event via RabbitMQ
        publishEvent("transaction.completed", {
            transactionId: DepositTnx.data.transaction.id,
            reference,
            userId,
            walletId: DepositTnx.data.wallet.id,
            type: "credit",
            category: "funding",
            amount: amount.toFixed(4),
            balanceBefore,
            balanceAfter,
            timestamp: new Date().toISOString(),
        });

        depositLogger.info(
            { reference, userId, amount },
            "Deposit completed successfully"
        );

        return {
            success: true,
            data: {
                transaction: {
                    id: DepositTnx.data.transaction.id,
                    reference: DepositTnx.data.transaction.reference,
                    amount: DepositTnx.data.transaction.amount,
                    balanceBefore: DepositTnx.data.transaction.balanceBefore,
                    balanceAfter: DepositTnx.data.transaction.balanceAfter,
                    type: DepositTnx.data.transaction.type,
                    category: DepositTnx.data.transaction.category,
                    status: DepositTnx.data.transaction.status,
                    narration: DepositTnx.data.transaction.narration,
                    createdAt: DepositTnx.data.transaction.createdAt,
                },
                wallet: {
                    id: wallet.id,
                    newBalance: balanceAfter,
                },
            },
        };
    } catch (error) {

        depositLogger.error({ error, reference, userId }, "Deposit failed");
        return {
            success: false,
            error: "Deposit failed",
            details: "An internal error occurred while processing the deposit.",
        };
    }
};
