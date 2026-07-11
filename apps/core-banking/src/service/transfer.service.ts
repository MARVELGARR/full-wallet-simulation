import * as z from "zod";
import { ServiceResult } from "../utils/types";
import { generateReference } from "../utils/reference.utils";
import { findIdempotencyKey, insertIdempotencyKey } from "../data-access-layer-core/idempotency.data-access-layer";
import { publishEvent } from "../settings/rabbitQ.config";
import { serverLogger } from "../settings/pino.config";
import { db } from "../settings/db.config";
import { ledger, outboxEvents, transactions, wallets } from "../database/schema";
import { eq } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────
// TRANSFER SERVICE (P2P)
// Handles peer-to-peer transfers between two user wallets.
// Debits the sender, credits the receiver, creates transaction
// + ledger records for BOTH sides, and publishes events.
// ─────────────────────────────────────────────────────────────

const TransferSchema = z.object({
    senderUserId: z.string().uuid("Invalid sender user ID"),
    receiverUserId: z.string().uuid("Invalid receiver user ID"),
    amount: z
        .number({ error: "Amount is required" })
        .positive("Amount must be greater than zero")
        .max(5_000_000, "Single transfer cannot exceed 5,000,000"),
    narration: z.string().max(255).optional().default("P2P Transfer"),
    idempotencyKey: z.string().optional(),
}).refine((data) => data.senderUserId !== data.receiverUserId, {
    message: "You cannot transfer to yourself",
    path: ["receiverUserId"],
});

interface TransferSuccessPayload {
    senderTransaction: {
        id: string;
        reference: string;
        amount: string;
        balanceBefore: string;
        balanceAfter: string;
        status: string;
    };
    receiverTransaction: {
        id: string;
        reference: string;
        amount: string;
        balanceBefore: string;
        balanceAfter: string;
        status: string;
    };
}

export const transfer_service = async (
    data: unknown
): Promise<ServiceResult<TransferSuccessPayload>> => {
    const transferLogger = serverLogger.child({ service: "transfer" });

    // Validate input
    const parsed = TransferSchema.safeParse(data);
    if (!parsed.success) {
        return {
            success: false,
            error: "Validation failed",
            details: parsed.error.flatten().fieldErrors,
        };
    }

    const { senderUserId, receiverUserId, amount, narration, idempotencyKey } = parsed.data;



    // Check idempotency
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

    try {
        const p2pTranxResult = await db.transaction(async (tx) => {
            // Find sender wallet
            const [senderWallet] = await tx.select().from(wallets).where(eq(wallets.userId, senderUserId)).for("update");
            if (!senderWallet) {
                return {
                    success: false as const,
                    error: "Sender wallet not found",
                    details: "No wallet found for the sender.",
                };
            }

            const senderBalance = parseFloat(senderWallet.balance);
            if (isNaN(senderBalance)) {
                return {
                    success: false as const,
                    error: "Invalid sender balance",
                    details: "The balance of the sender is  not a number"
                };
            }

            // Find receiver wallet
            const [receiverWallet] = await tx.select().from(wallets).where(eq(wallets.userId, receiverUserId)).for("update");
            if (!receiverWallet) {
                return {
                    success: false as const,
                    error: "Receiver wallet not found",
                    details: "No wallet found for the receiver.",
                };
            }

            const receiverBalance = parseFloat(receiverWallet.balance);
            if (isNaN(receiverBalance)) {
                return {
                    success: false as const,
                    error: "Invalid receiver balance",
                    details: "The balance of the receiver is  not a number"
                };
            }
            //check if sender is reciever
            if (senderWallet.userId === receiverWallet.userId) {
                return {
                    success: false as const,
                    error: "sender userId is same as receiverId",
                    details: "cannot send to yourself"
                };
            }

            //check is amount is less than 1
            if (amount <= 0) {
                return {
                    success: false as const,
                    error: "Amount less than 1",
                    details: "Amount must be greater than 0"
                };
            }

            // Check sender has sufficient balance
            if (senderBalance < amount) {
                return {
                    success: false as const,
                    error: "Insufficient funds",
                    details: `Sender balance (${senderBalance.toFixed(4)}) is less than transfer amount (${amount.toFixed(4)}).`,
                };
            }

            //Calculate new balances
            const senderBalanceBefore = senderWallet.balance;
            const senderBalanceAfter = (senderBalance - amount).toFixed(4);

            const receiverBalanceBefore = receiverWallet.balance;
            const receiverBalanceAfter = (parseFloat(receiverWallet.balance) + amount).toFixed(4);
            const senderRef = generateReference("P2P");
            // create sender debit transaction
            const [senderTx] = await tx.insert(transactions).values({
                reference: senderRef,
                walletId: senderWallet.id,
                amount: amount.toFixed(4),
                balanceBefore: senderBalanceBefore,
                balanceAfter: senderBalanceAfter,
                type: "debit",
                category: "p2p_transfere",
                narration: narration || "P2P Transfer",
                status: "pending",
                metadata: { counterpartyUserId: receiverUserId, direction: "outbound" },
            }).returning()


            await tx.insert(ledger).values({
                txnId: senderTx.id,
                walletId: senderWallet.id,
                type: "debit",
                amount: amount.toFixed(4),
            })
            await tx.update(wallets).set({ balance: senderBalanceAfter }).where(eq(wallets.id, senderWallet.id))

            await tx.update(transactions).set({ status: "completed" }).where(eq(transactions.id, senderTx.id))

            //receiver transaction
            const receiverRef = generateReference("P2P");

            const [receiverTx] = await tx.insert(transactions).values({
                reference: receiverRef,
                walletId: receiverWallet.id,
                amount: amount.toFixed(4),
                balanceBefore: receiverBalanceBefore,
                balanceAfter: receiverBalanceAfter,
                type: "credit",
                category: "p2p_transfere",
                narration: narration || "P2P Transfer received",
                status: "pending",
                metadata: { counterpartyUserId: senderUserId, direction: "inbound" },
            }).returning()


            await tx.insert(ledger).values({
                txnId: receiverTx.id,
                walletId: receiverWallet.id,
                type: "credit",
                amount: amount.toFixed(4),
            })

            await tx.update(wallets).set({ balance: receiverBalanceAfter }).where(eq(wallets.id, receiverWallet.id))

            await tx.update(transactions).set({ status: "completed" }).where(eq(transactions.id, receiverTx.id))

            // ── OUTBOX PATTERN (Guarantee Event Delivery) ────────
            await tx.insert(outboxEvents).values({
                eventType: "transaction.completed",
                payload: {
                    type: "p2p_transfer",
                    senderTransactionId: senderTx.id,
                    receiverTransactionId: receiverTx.id,
                    senderUserId,
                    receiverUserId,
                    amount: amount.toFixed(4),
                    timestamp: new Date().toISOString(),
                }
            })

            return {
                success: true as const,
                data: {
                    senderTransaction: {
                        id: senderTx.id,
                        reference: senderRef,
                        amount: amount.toFixed(4),
                        balanceBefore: senderBalanceBefore,
                        balanceAfter: senderBalanceAfter,
                        status: "completed",
                    },
                    receiverTransaction: {
                        id: receiverTx.id,
                        reference: receiverRef,
                        amount: amount.toFixed(4),
                        balanceBefore: receiverBalanceBefore,
                        balanceAfter: receiverBalanceAfter,
                        status: "completed",
                    },
                },
            };

        });

        if (!p2pTranxResult.success) {
            return p2pTranxResult;
        }

        const p2pTranx = p2pTranxResult.data;

        // ── IDEMPOTENCY ──────────────────────────────────────
        if (idempotencyKey) {
            await insertIdempotencyKey(idempotencyKey, p2pTranx.senderTransaction.id);
        }



        // ── PUBLISH EVENTS ───────────────────────────────────
        // We now rely on the Outbox Worker to publish the event instead of publishing directly,
        // to guarantee that the database commit and the event firing don't become out of sync.

        const senderRef = p2pTranx.senderTransaction.reference
        const receiverRef = p2pTranx.receiverTransaction.reference
        transferLogger.info(
            { senderRef, receiverRef, senderUserId, receiverUserId, amount },
            "P2P Transfer completed successfully"
        );

        return {
            success: true,
            data: {
                senderTransaction: {
                    id: p2pTranx.senderTransaction.id,
                    reference: p2pTranx.senderTransaction.reference,
                    amount: amount.toFixed(4),
                    balanceBefore: p2pTranx.senderTransaction.balanceBefore,
                    balanceAfter: p2pTranx.senderTransaction.balanceAfter,
                    status: "completed",
                },
                receiverTransaction: {
                    id: p2pTranx.receiverTransaction.id,
                    reference: p2pTranx.receiverTransaction.reference,
                    amount: amount.toFixed(4),
                    balanceBefore: p2pTranx.receiverTransaction.balanceBefore,
                    balanceAfter: p2pTranx.receiverTransaction.balanceAfter,
                    status: "completed",
                },
            },
        };



    } catch (error) {
        publishEvent("transaction.failed", {
            type: "p2p_transfer",
            senderUserId,
            receiverUserId,
            amount: amount.toFixed(4),
            reason: "internal_error",
            timestamp: new Date().toISOString(),
        });

        transferLogger.error(
            { error, senderUserId, receiverUserId, amount },
            "P2P Transfer failed"
        );
        return {
            success: false,
            error: "Transfer failed",
            details: "An internal error occurred while processing the transfer.",
        };
    }


};
