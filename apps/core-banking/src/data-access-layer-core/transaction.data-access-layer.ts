import { transactions, ledger, idempotencyKeys } from "../database/schema";
import { db } from "../settings/db.config";
import { eq, desc, and, sql } from "drizzle-orm";


// ─────────────────────────────────────────────────────────────
// TRANSACTION DATA ACCESS LAYER
// All raw database operations for the transactions table.
// ─────────────────────────────────────────────────────────────

export type TransactionInsert = typeof transactions.$inferInsert;
export type TransactionSelect = typeof transactions.$inferSelect;

/**
 * Insert a new transaction record.
 */
export const insertTransaction = async (data: TransactionInsert) => {
    const [txn] = await db.insert(transactions).values(data).returning();
    return txn;
};

/**
 * Find a transaction by its ID.
 */
export const findTransactionById = async (id: string) => {
    return await db.query.transactions.findFirst({
        where: (transactions, { eq }) => eq(transactions.id, id),
    });
};

/**
 * Find a transaction by its unique reference.
 */
export const findTransactionByReference = async (reference: string) => {
    return await db.query.transactions.findFirst({
        where: (transactions, { eq }) => eq(transactions.reference, reference),
    });
};

/**
 * List all transactions for a given wallet (with pagination).
 */
export const findTransactionsByWalletId = async (
    walletId: string,
    limit: number = 20,
    offset: number = 0
) => {
    return await db
        .select()
        .from(transactions)
        .where(eq(transactions.walletId, walletId))
        .orderBy(desc(transactions.createdAt))
        .limit(limit)
        .offset(offset);
};

/**
 * Update a transaction's status (e.g., pending → completed / failed).
 */
export const updateTransactionStatus = async (
    txnId: string,
    status: "pending" | "completed" | "failed"
) => {
    const [updated] = await db
        .update(transactions)
        .set({ status, updatedAt: new Date() })
        .where(eq(transactions.id, txnId))
        .returning();
    return updated;
};

/**
 * Count total transactions for a wallet (used for pagination metadata).
 */
export const countTransactionsByWalletId = async (walletId: string) => {
    const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(eq(transactions.walletId, walletId));
    return Number(result.count);
};
