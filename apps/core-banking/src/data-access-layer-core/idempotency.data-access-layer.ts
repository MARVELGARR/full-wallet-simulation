import { idempotencyKeys } from "../database/schema";
import { db } from "../settings/db.config";
import { eq } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────
// IDEMPOTENCY DATA ACCESS LAYER
// Prevents duplicate transactions via idempotency keys.
// ─────────────────────────────────────────────────────────────

/**
 * Check if an idempotency key already exists.
 */
export const findIdempotencyKey = async (key: string) => {
    return await db.query.idempotencyKeys.findFirst({
        where: (idempotencyKeys, { eq }) => eq(idempotencyKeys.key, key),
    });
};

/**
 * Save a new idempotency key linked to a transaction.
 */
export const insertIdempotencyKey = async (key: string, txnId: string) => {
    const [entry] = await db
        .insert(idempotencyKeys)
        .values({ key, txnId })
        .returning();
    return entry;
};
