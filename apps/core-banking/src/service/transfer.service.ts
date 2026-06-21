import * as z from "zod";
import { ServiceResult } from "../utils/types";
import { generateReference } from "../utils/reference.utils";
import { findWalletByUserId, updateWalletBalance } from "../data-access-layer-core/wallet.data-access-layer";
import { insertTransaction, updateTransactionStatus } from "../data-access-layer-core/transaction.data-access-layer";
import { insertLedgerEntry } from "../data-access-layer-core/ledger.data-access-layer";
import { findIdempotencyKey, insertIdempotencyKey } from "../data-access-layer-core/idempotency.data-access-layer";
import { publishEvent } from "../settings/rabbitQ.config";
import { serverLogger } from "../settings/pino.config";

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

    // 1. Validate input
    const parsed = TransferSchema.safeParse(data);
    if (!parsed.success) {
        return {
            success: false,
            error: "Validation failed",
            details: parsed.error.flatten().fieldErrors,
        };
    }

    const { senderUserId, receiverUserId, amount, narration, idempotencyKey } = parsed.data;

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

    // 3. Find sender wallet
    const senderWallet = await findWalletByUserId(senderUserId);
    if (!senderWallet) {
        return {
            success: false,
            error: "Sender wallet not found",
            details: "No wallet found for the sender.",
        };
    }

    // 4. Find receiver wallet
    const receiverWallet = await findWalletByUserId(receiverUserId);
    if (!receiverWallet) {
        return {
            success: false,
            error: "Receiver wallet not found",
            details: "No wallet found for the receiver.",
        };
    }

    // 5. Check sender has sufficient balance
    const senderBalance = parseFloat(senderWallet.balance);
    if (senderBalance < amount) {
        return {
            success: false,
            error: "Insufficient funds",
            details: `Sender balance (${senderBalance.toFixed(4)}) is less than transfer amount (${amount.toFixed(4)}).`,
        };
    }

    // 6. Calculate new balances
    const senderBalanceBefore = senderWallet.balance;
    const senderBalanceAfter = (senderBalance - amount).toFixed(4);

    const receiverBalanceBefore = receiverWallet.balance;
    const receiverBalanceAfter = (
        parseFloat(receiverWallet.balance) + amount
    ).toFixed(4);

    const senderRef = generateReference("P2P");
    const receiverRef = generateReference("P2P");

    try {
        // ── SENDER SIDE (DEBIT) ──────────────────────────────
        const senderTxn = await insertTransaction({
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
        });

        await updateWalletBalance(senderWallet.id, senderBalanceAfter);

        await insertLedgerEntry({
            txnId: senderTxn.id,
            walletId: senderWallet.id,
            type: "debit",
            amount: amount.toFixed(4),
        });

        await updateTransactionStatus(senderTxn.id, "completed");

        // ── RECEIVER SIDE (CREDIT) ───────────────────────────
        const receiverTxn = await insertTransaction({
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
        });

        await updateWalletBalance(receiverWallet.id, receiverBalanceAfter);

        await insertLedgerEntry({
            txnId: receiverTxn.id,
            walletId: receiverWallet.id,
            type: "credit",
            amount: amount.toFixed(4),
        });

        await updateTransactionStatus(receiverTxn.id, "completed");

        // ── IDEMPOTENCY ──────────────────────────────────────
        if (idempotencyKey) {
            await insertIdempotencyKey(idempotencyKey, senderTxn.id);
        }

        // ── PUBLISH EVENTS ───────────────────────────────────
        publishEvent("transaction.completed", {
            type: "p2p_transfer",
            senderTransactionId: senderTxn.id,
            receiverTransactionId: receiverTxn.id,
            senderUserId,
            receiverUserId,
            amount: amount.toFixed(4),
            timestamp: new Date().toISOString(),
        });

        transferLogger.info(
            { senderRef, receiverRef, senderUserId, receiverUserId, amount },
            "P2P Transfer completed successfully"
        );

        return {
            success: true,
            data: {
                senderTransaction: {
                    id: senderTxn.id,
                    reference: senderRef,
                    amount: amount.toFixed(4),
                    balanceBefore: senderBalanceBefore,
                    balanceAfter: senderBalanceAfter,
                    status: "completed",
                },
                receiverTransaction: {
                    id: receiverTxn.id,
                    reference: receiverRef,
                    amount: amount.toFixed(4),
                    balanceBefore: receiverBalanceBefore,
                    balanceAfter: receiverBalanceAfter,
                    status: "completed",
                },
            },
        };
    } catch (error) {
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
