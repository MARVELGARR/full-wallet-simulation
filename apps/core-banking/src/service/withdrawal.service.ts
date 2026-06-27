import * as z from "zod";
import { ServiceResult } from "../utils/types";
import { generateReference } from "../utils/reference.utils";
import { findeWalletByUserIdForUpdate, findWalletByUserId, updateWalletBalance } from "../data-access-layer-core/wallet.data-access-layer";
import { insertTransaction, updateTransactionStatus } from "../data-access-layer-core/transaction.data-access-layer";
import { insertLedgerEntry } from "../data-access-layer-core/ledger.data-access-layer";
import { findIdempotencyKey, insertIdempotencyKey } from "../data-access-layer-core/idempotency.data-access-layer";
import { publishEvent } from "../settings/rabbitQ.config";
import { serverLogger } from "../settings/pino.config";
import { db } from "../settings/db.config";
import { ledger, transactions, wallets } from "../database/schema";
import { and, eq } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────
// WITHDRAWAL SERVICE
// Handles debiting a user's wallet — validates input, checks
// sufficient funds, updates balance, creates transaction + 
// ledger records, and publishes events via RabbitMQ.
// ─────────────────────────────────────────────────────────────

const WithdrawalSchema = z.object({
    userId: z.string().uuid("Invalid user ID"),
    amount: z
        .number({ error: "Amount is required" })
        .positive("Amount must be greater than zero")
        .max(5_000_000, "Single withdrawal cannot exceed 5,000,000"),
    narration: z.string().max(255).optional().default("Wallet withdrawal"),
    idempotencyKey: z.string().optional(),
});

type WithdrawalInput = z.infer<typeof WithdrawalSchema>;

interface WithdrawalSuccessPayload {
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

export const withdrawal_service = async (
    data: unknown
): Promise<ServiceResult<WithdrawalSuccessPayload>> => {
    const withdrawalLogger = serverLogger.child({ service: "withdrawal" });

    // 1. Validate input
    const parsed = WithdrawalSchema.safeParse(data);
    if (!parsed.success) {
        return {
            success: false,
            error: "Validation failed",
            details: parsed.error.flatten().fieldErrors,
        };
    }

    const { userId, amount, narration, idempotencyKey } = parsed.data;

    // 2. Check idempotency
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
            details: "No wallet found for this user.",
        };
    }

    // 4. Check sufficient balance
    const currentBalance = parseFloat(wallet.balance);
    if (currentBalance < amount) {
        return {
            success: false,
            error: "Insufficient funds",
            details: `Current balance (${currentBalance.toFixed(4)}) is less than withdrawal amount (${amount.toFixed(4)}).`,
        };
    }

    // 5. Calculate new balance
    const balanceBefore = wallet.balance;
    const balanceAfter = (currentBalance - amount).toFixed(4);
    const reference = generateReference("WDR");

    try {


        const withdrawerTxn = await db.transaction(async (tx) => {

            const [txn] = await tx.insert(transactions).values({
                reference,
                walletId: wallet.id,
                amount: amount.toFixed(4),
                balanceBefore,
                balanceAfter,
                type: "debit",
                category: "withdrawal",
                narration: narration || "Wallet withdrawal",
                status: "pending",
            }).returning()

            await tx.insert(ledger).values({
                txnId: txn.id,
                walletId: wallet.id,
                type: "debit",
                amount: amount.toFixed(4),
            })


            await tx.update(wallets).set({ balance: balanceAfter }).where(eq(wallets.userId, userId))

            await tx.update(transactions).set({ status: "completed" }).where(eq(transactions.id, txn.id))


            return {
                success: true,
                data: {
                    transaction: {
                        id: txn.id,
                        reference: txn.reference,
                        amount: txn.amount,
                        balanceBefore: txn.balanceBefore,
                        balanceAfter: txn.balanceAfter,
                        type: txn.type,
                        category: txn.category,
                        status: txn.status,
                        narration: txn.narration,
                        createdAt: txn.createdAt,
                    },
                    wallet: {
                        id: wallet.id,
                        newBalance: balanceAfter,
                    },
                },
            };
        })

        // 10. Save idempotency key
        if (idempotencyKey) {
            await insertIdempotencyKey(idempotencyKey, withdrawerTxn.data.transaction.id);
        }

        // 11. Publish event via RabbitMQ
        publishEvent("transaction.completed", {
            transactionId: withdrawerTxn.data.transaction.id,
            reference,
            userId,
            walletId: wallet.id,
            type: "debit",
            category: "withdrawal",
            amount: amount.toFixed(4),
            balanceBefore,
            balanceAfter,
            timestamp: new Date().toISOString(),
        });

        withdrawalLogger.info(
            { reference, userId, amount },
            "Withdrawal completed successfully"
        );

        return {
            success: true,
            data: {
                transaction: {
                    id: withdrawerTxn.data.transaction.id,
                    reference: withdrawerTxn.data.transaction.reference,
                    amount: withdrawerTxn.data.transaction.amount,
                    balanceBefore: withdrawerTxn.data.transaction.balanceBefore,
                    balanceAfter: withdrawerTxn.data.transaction.balanceAfter,
                    type: withdrawerTxn.data.transaction.type,
                    category: withdrawerTxn.data.transaction.category,
                    status: withdrawerTxn.data.transaction.status,
                    narration: withdrawerTxn.data.transaction.narration,
                    createdAt: withdrawerTxn.data.transaction.createdAt,
                },
                wallet: {
                    id: wallet.id,
                    newBalance: balanceAfter,
                },
            },
        };
    } catch (error) {


        withdrawalLogger.error({ error, reference, userId }, "Withdrawal failed");
        return {
            success: false,
            error: "Withdrawal failed",
            details: "An internal error occurred while processing the withdrawal.",
        };
    }
};
