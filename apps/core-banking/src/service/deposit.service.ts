import * as z from "zod";
import { ServiceResult } from "../utils/types";
import { generateReference } from "../utils/reference.utils";
import { findWalletByUserId } from "../data-access-layer-core/wallet.data-access-layer";
import { updateWalletBalance } from "../data-access-layer-core/wallet.data-access-layer";
import { insertTransaction, updateTransactionStatus } from "../data-access-layer-core/transaction.data-access-layer";
import { insertLedgerEntry } from "../data-access-layer-core/ledger.data-access-layer";
import { findIdempotencyKey, insertIdempotencyKey } from "../data-access-layer-core/idempotency.data-access-layer";
import { publishEvent } from "../settings/rabbitQ.config";
import { serverLogger } from "../settings/pino.config";

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
    const wallet = await findWalletByUserId(userId);
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
        const txn = await insertTransaction({
            reference,
            walletId: wallet.id,
            amount: amount.toFixed(4),
            balanceBefore,
            balanceAfter,
            type: "credit",
            category: "funding",
            narration: narration || "Wallet funding",
            status: "pending",
        });

        // 6. Update the wallet balance
        await updateWalletBalance(wallet.id, balanceAfter);

        // 7. Create the ledger entry (double-entry bookkeeping)
        await insertLedgerEntry({
            txnId: txn.id,
            walletId: wallet.id,
            type: "credit",
            amount: amount.toFixed(4),
        });

        // 8. Mark the transaction as completed
        const completedTxn = await updateTransactionStatus(txn.id, "completed");

        // 9. Save idempotency key
        if (idempotencyKey) {
            await insertIdempotencyKey(idempotencyKey, txn.id);
        }

        // 10. Publish event via RabbitMQ
        publishEvent("transaction.completed", {
            transactionId: txn.id,
            reference,
            userId,
            walletId: wallet.id,
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
                    id: completedTxn.id,
                    reference: completedTxn.reference,
                    amount: completedTxn.amount,
                    balanceBefore: completedTxn.balanceBefore,
                    balanceAfter: completedTxn.balanceAfter,
                    type: completedTxn.type,
                    category: completedTxn.category,
                    status: completedTxn.status,
                    narration: completedTxn.narration,
                    createdAt: completedTxn.createdAt,
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
