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
import { ledger, outboxEvents, transactions, wallets } from "../database/schema";
import { eq } from "drizzle-orm";

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

// type WithdrawalInput = z.infer<typeof WithdrawalSchema>;

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

    const reference = generateReference("WDR");

    try {
        const withdrawerTxnResult = await db.transaction(async (tx) => {
            // 3. Find the user's wallet
            const [wallet] = await tx
                .select()
                .from(wallets)
                .where(eq(wallets.userId, userId))
                .for("update");

            if (!wallet) {
                return {
                    success: false as const,
                    error: "Wallet not found",
                    details: "No wallet found for this user.",
                };
            }

            // 4. Check sufficient balance
            const currentBalance = parseFloat(wallet.balance);
            if (currentBalance < amount) {
                return {
                    success: false as const,
                    error: "Insufficient funds",
                    details: `Current balance (${currentBalance.toFixed(4)}) is less than withdrawal amount (${amount.toFixed(4)}).`,
                };
            }

            // 5. Calculate new balance
            const balanceBefore = wallet.balance;
            const balanceAfter = (currentBalance - amount).toFixed(4);

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
            }).returning();

            await tx.insert(ledger).values({
                txnId: txn.id,
                walletId: wallet.id,
                type: "debit",
                amount: amount.toFixed(4),
            });


            await tx.update(wallets).set({ balance: balanceAfter }).where(eq(wallets.userId, userId));

            await tx.update(transactions).set({ status: "completed" }).where(eq(transactions.id, txn.id));

            // ── OUTBOX PATTERN (Guarantee Event Delivery) ────────
            await tx.insert(outboxEvents).values({
                eventType: "transaction.completed",
                payload: {
                    transactionId: txn.id,
                    reference,
                    userId,
                    walletId: wallet.id,
                    type: "debit",
                    category: "withdrawal",
                    amount: amount.toFixed(4),
                    balanceBefore,
                    balanceAfter,
                    timestamp: new Date().toISOString(),
                }
            });


            return {
                success: true as const,
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
        });

        if (!withdrawerTxnResult.success) {
            return withdrawerTxnResult;
        }

        const withdrawerTxn = withdrawerTxnResult.data;

        // 10. Save idempotency key
        if (idempotencyKey) {
            await insertIdempotencyKey(idempotencyKey, withdrawerTxn.transaction.id);
        }

        // 11. Publish event via RabbitMQ
        // Handled securely by the Outbox Worker via the outboxEvents table.

        withdrawalLogger.info(
            { reference, userId, amount },
            "Withdrawal completed successfully"
        );

        return {
            success: true,
            data: {
                transaction: {
                    id: withdrawerTxn.transaction.id,
                    reference: withdrawerTxn.transaction.reference,
                    amount: withdrawerTxn.transaction.amount,
                    balanceBefore: withdrawerTxn.transaction.balanceBefore,
                    balanceAfter: withdrawerTxn.transaction.balanceAfter,
                    type: withdrawerTxn.transaction.type,
                    category: withdrawerTxn.transaction.category,
                    status: withdrawerTxn.transaction.status,
                    narration: withdrawerTxn.transaction.narration,
                    createdAt: withdrawerTxn.transaction.createdAt,
                },
                wallet: {
                    id: withdrawerTxn.wallet.id,
                    newBalance: withdrawerTxn.wallet.newBalance,
                },
            },
        };
    } catch (error) {
        publishEvent("transaction.failed", {
            type: "withdrawal",
            userId,
            amount: amount.toFixed(4),
            reason: "internal_error",
            timestamp: new Date().toISOString(),
        });

        withdrawalLogger.error({ error, reference, userId }, "Withdrawal failed");
        return {
            success: false,
            error: "Withdrawal failed",
            details: "An internal error occurred while processing the withdrawal.",
        };
    }
};
