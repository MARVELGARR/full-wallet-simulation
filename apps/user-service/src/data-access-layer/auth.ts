



import { eq, and } from "drizzle-orm";
import { db } from "../settings/db.config";
import { refreshTokens } from "../database/schema";

// ─────────────────────────────────────────────────────────────
// REFRESH TOKEN DAL
// ─────────────────────────────────────────────────────────────

export interface NewRefreshToken {
    userId:    string;
    token:     string;
    expiresAt: Date;
}

/**
 * Saves a new refresh token to the database.
 */
export const saveRefreshToken = async (data: NewRefreshToken) => {
    return await db.insert(refreshTokens).values({
        userId:    data.userId,
        token:     data.token,
        expiresAt: data.expiresAt,
    }).returning();
};

/**
 * Finds a refresh token by its value.
 */
export const findRefreshToken = async (token: string) => {
    const result = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.token, token), eq(refreshTokens.revoked, false)))
        .limit(1);
    
    return result[0];
};

/**
 * Revokes a specific refresh token (used for logout).
 */
export const revokeRefreshToken = async (token: string) => {
    return await db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.token, token))
        .returning();
};

/**
 * Revokes all refresh tokens for a specific user (global logout).
 */
export const revokeAllUserTokens = async (userId: string) => {
    return await db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.userId, userId))
        .returning();
};

/**
 * Optionally: Clean up expired tokens.
 */
export const deleteExpiredTokens = async () => {
    // This could be run as a cron job
    // return await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()));
};
