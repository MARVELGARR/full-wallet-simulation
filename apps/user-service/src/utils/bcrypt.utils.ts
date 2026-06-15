import bcrypt from "bcrypt";

// ─────────────────────────────────────────────────────────────
// BCRYPT CONFIG
// 12 rounds is a solid production default — fast enough for
// legitimate users, expensive enough to slow brute-force attacks.
// ─────────────────────────────────────────────────────────────
const SALT_ROUNDS = 12;

/**
 * Hashes a plain-text password using bcrypt.
 * bcrypt automatically generates and embeds a unique salt.
 *
 * @param plainPassword - The raw password from the user.
 * @returns The bcrypt hash string (safe to store in the database).
 * @throws If bcrypt fails internally (extremely rare).
 */
export const hashPassword = (plainPassword: string): Promise<string> => {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
};

/**
 * Compares a plain-text password against a stored bcrypt hash.
 * Use this during login to verify credentials.
 *
 * @param plainPassword - The raw password attempt.
 * @param hash - The stored bcrypt hash from the database.
 * @returns `true` if they match, `false` otherwise.
 */
export const comparePassword = (
    plainPassword: string,
    hash: string
): Promise<boolean> => {
    return bcrypt.compare(plainPassword, hash);
};
