import { insertWallet, findWalletByUserId as findWalletInDb } from "../data-access-layer-core/wallet.data-access-layer"
import { createInsertSchema } from "drizzle-zod"
import { wallets } from "../database/schema"
import * as z from "zod"

// Schema for inserting a wallet
export const walletInsertSchema = createInsertSchema(wallets).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
}).extend({
    userId: z.string().uuid(),
    currency: z.string().length(3).default("USD"),
});

export type WalletInsert = z.infer<typeof walletInsertSchema>

/**
 * Creates a new wallet for a user.
 * Default balance is 0.0000.
 */
export const createWallet = async (data: WalletInsert) => {
    const result = walletInsertSchema.safeParse(data);
    
    if (!result.success) {
        throw new Error(`Invalid wallet creation data: ${result.error.message}`);
    }

    const { userId, currency } = result.data;

    try {
        const newWallet = await insertWallet({
            userId,
            currency: currency || "USD",
            balance: "0.0000",
        });

        return newWallet;
    } catch (error) {
        console.error("Error in createWallet service:", error);
        throw error;
    }
}

/**
 * Finds a wallet by userId.
 */
export const findWalletByUserId = async (userId: string) => {
    return await findWalletInDb(userId);
}
