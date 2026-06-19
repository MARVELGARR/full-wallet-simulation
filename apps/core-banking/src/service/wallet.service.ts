import { insertWallet, findWalletByUserId as findWalletInDb } from "../data-access-layer-core/wallet.data-access-layer"
import { createInsertSchema } from "drizzle-zod"
import { wallets } from "../database/schema"
import * as z from "zod"


type ServiceSuccess<T> = { success: true; data: T };
type ServiceError = { success: false; error: string; details?: unknown };
type ServiceResult<T> = ServiceSuccess<T> | ServiceError;


// Schema for inserting a wallet
export const walletInsertSchema = createInsertSchema(wallets).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
}).extend({
    userId: z.string().uuid(),
    currency: z.string().length(3).default("NGN"),

});

export type WalletInsert = z.infer<typeof walletInsertSchema>
 type walletCreationSuccessType = {
    id: string;
    userId: string;
    balance: string;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
 }

/**
 * Creates a new wallet for a user.
 * Default balance is 0.0000.
 */
export const createWallet = async (data: WalletInsert) : Promise<ServiceResult<walletCreationSuccessType>> => {
    const result = walletInsertSchema.safeParse(data);
    
    if (!result.success) {
        return {
            success: false,
            error: "Validation failed",
            details: result.error.flatten().fieldErrors,
        }
    }

    const { userId, currency } = result.data;


        const newWallet = await insertWallet({
            userId,
            currency: currency || "USD",
            balance: "0.0000",
        });

        if(!newWallet){
            return {
                success: false,
            error: "Wallet not created",
            details: "Wallet not created"
            }
        }
        
        return {
            success: true,
            data: newWallet
        }

    
    
}


