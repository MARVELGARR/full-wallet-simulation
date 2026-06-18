import { wallets } from "../database/schema"
import { db } from "../settings/db.config"
import { eq } from "drizzle-orm"

export const findWalletByUserId = async (userId: string) => {
    return await db.query.wallets.findFirst({
        where: (wallets, { eq }) => eq(wallets.userId, userId),
    });
}

export const insertWallet = async (data: { userId: string, currency: string, balance: string }) => {
    const [newWallet] = await db.insert(wallets).values(data).returning();
    return newWallet;
}

export const updateWalletBalance = async (walletId: string, newBalance: string) => {
    return await db.update(wallets)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(wallets.id, walletId))
        .returning();
}
