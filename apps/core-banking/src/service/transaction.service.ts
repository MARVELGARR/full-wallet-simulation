import * as z from "zod";
import { ServiceResult } from "../utils/types";
import { findWalletByUserId } from "../data-access-layer-core/wallet.data-access-layer";
import {
    findTransactionById,
    findTransactionByReference,
    findTransactionsByWalletId,
    countTransactionsByWalletId,
} from "../data-access-layer-core/transaction.data-access-layer";
import { serverLogger } from "../settings/pino.config";

// ─────────────────────────────────────────────────────────────
// TRANSACTION SERVICE
// Handles querying & listing transaction history.
// All mutation operations (deposit, withdrawal, transfer) live
// in their own dedicated service files.
// ─────────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────
interface TransactionRecord {
    id: string;
    reference: string;
    walletId: string;
    amount: string;
    balanceBefore: string;
    balanceAfter: string;
    type: string;
    category: string;
    narration: string | null;
    status: string;
    metadata: unknown;
    reversalOf: string | null;
    createdAt: Date;
    updatedAt: Date;
}

interface PaginatedTransactions {
    transactions: TransactionRecord[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

// ── Get Transaction By ID ────────────────────────────────────
export const getTransactionById = async (
    txnId: string
): Promise<ServiceResult<TransactionRecord>> => {
    const txnLogger = serverLogger.child({ service: "transaction" });

    if (!txnId) {
        return { success: false, error: "Transaction ID is required" };
    }

    try {
        const txn = await findTransactionById(txnId);
        if (!txn) {
            return {
                success: false,
                error: "Transaction not found",
                details: `No transaction found with ID: ${txnId}`,
            };
        }

        return { success: true, data: txn };
    } catch (error) {
        txnLogger.error({ error, txnId }, "Failed to fetch transaction by ID");
        return {
            success: false,
            error: "Failed to fetch transaction",
            details: "An internal error occurred.",
        };
    }
};

// ── Get Transaction By Reference ─────────────────────────────
export const getTransactionByReference = async (
    reference: string
): Promise<ServiceResult<TransactionRecord>> => {
    const txnLogger = serverLogger.child({ service: "transaction" });

    if (!reference) {
        return { success: false, error: "Transaction reference is required" };
    }

    try {
        const txn = await findTransactionByReference(reference);
        if (!txn) {
            return {
                success: false,
                error: "Transaction not found",
                details: `No transaction found with reference: ${reference}`,
            };
        }

        return { success: true, data: txn };
    } catch (error) {
        txnLogger.error({ error, reference }, "Failed to fetch transaction by reference");
        return {
            success: false,
            error: "Failed to fetch transaction",
            details: "An internal error occurred.",
        };
    }
};

// ── Get Transaction History (Paginated) ──────────────────────
const HistorySchema = z.object({
    userId: z.string().uuid("Invalid user ID"),
    page: z.number().int().positive().optional().default(1),
    limit: z.number().int().positive().max(100).optional().default(20),
});

export const getTransactionHistory = async (
    data: unknown
): Promise<ServiceResult<PaginatedTransactions>> => {
    const txnLogger = serverLogger.child({ service: "transaction" });

    // 1. Validate input
    const parsed = HistorySchema.safeParse(data);
    if (!parsed.success) {
        return {
            success: false,
            error: "Validation failed",
            details: parsed.error.flatten().fieldErrors,
        };
    }

    const { userId, page, limit } = parsed.data;

    try {
        // 2. Find the user's wallet
        const wallet = await findWalletByUserId(userId);
        if (!wallet) {
            return {
                success: false,
                error: "Wallet not found",
                details: "No wallet found for this user.",
            };
        }

        // 3. Get paginated transactions
        const offset = (page - 1) * limit;
        const [transactions, total] = await Promise.all([
            findTransactionsByWalletId(wallet.id, limit, offset),
            countTransactionsByWalletId(wallet.id),
        ]);

        return {
            success: true,
            data: {
                transactions,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            },
        };
    } catch (error) {
        txnLogger.error({ error, userId }, "Failed to fetch transaction history");
        return {
            success: false,
            error: "Failed to fetch transaction history",
            details: "An internal error occurred.",
        };
    }
};