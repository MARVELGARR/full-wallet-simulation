import crypto from "crypto";

// ─────────────────────────────────────────────────────────────
// TRANSACTION REFERENCE GENERATOR
// Produces a unique, human-readable reference for each transaction.
// Format: TXN-{category}-{timestamp}-{random}
// Example: TXN-FUND-1750000000000-a3f8b2
// ─────────────────────────────────────────────────────────────

type ReferencePrefix = "FUND" | "WDR" | "P2P" | "BILL" | "FEE" | "RFND" | "BNS";

export const generateReference = (prefix: ReferencePrefix = "FUND"): string => {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString("hex");
    return `TXN-${prefix}-${timestamp}-${random}`;
};
