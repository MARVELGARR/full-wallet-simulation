import { ledger } from "../database/schema";
import { db } from "../settings/db.config";
import { eq, desc } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────
// LEDGER DATA ACCESS LAYER
// Double-entry bookkeeping records for every transaction.
// ─────────────────────────────────────────────────────────────

export type LedgerInsert = typeof ledger.$inferInsert;
export type LedgerSelect = typeof ledger.$inferSelect;

/**
 * Insert a new ledger entry.
 */
export const insertLedgerEntry = async (data: LedgerInsert) => {
    const [entry] = await db.insert(ledger).values(data).returning();
    return entry;
};

/**
 * Find all ledger entries for a given transaction.
 */
export const findLedgerEntriesByTxnId = async (txnId: string) => {
    return await db
        .select()
        .from(ledger)
        .where(eq(ledger.txnId, txnId))
        .orderBy(desc(ledger.createdAt));
};

/**
 * Find all ledger entries for a specific wallet.
 */
export const findLedgerEntriesByWalletId = async (
    walletId: string,
    limit: number = 50,
    offset: number = 0
) => {
    return await db
        .select()
        .from(ledger)
        .where(eq(ledger.walletId, walletId))
        .orderBy(desc(ledger.createdAt))
        .limit(limit)
        .offset(offset);
};
