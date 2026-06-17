


import {decimal, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const transactionTypeEnum = pgEnum("transaction_type", ["credit", "debit", "transfer", "reversal"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "completed", "failed"]);
export const transactionCategoryEnum = pgEnum("transaction_category", ["fund", "withdrawal", "p2p", "bill", "fee"]);

export const wallet = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId:  uuid("user_id").notNull().unique(),
    balance: decimal("balance", { precision: 12, scale: 2 }).default("0.00").notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const transactions = pgTable("transaction", {
    id: uuid("id").primaryKey().defaultRandom(),
    ref: varchar("refrence").unique().notNull(),
    walletId: uuid("wallet_id").references(()=>wallet.id).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2}).notNull(),
    balanceBefore: decimal("balance_before", { precision: 12, scale: 2}).notNull(),
    balanceAfter: decimal("balance_after", { precision: 12, scale: 2}).notNull(),
    type: transactionTypeEnum("type").notNull(),
    transactionCategory: transactionCategoryEnum("category").notNull(), 
    narration: text("narration"),
    transactionStatus: transactionStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),

})
export const ledger = pgTable("ledger", {
    id: uuid("id").primaryKey().defaultRandom(),
    txnId: uuid("transaction_id").references(()=>transactions.id).notNull(),
    walletId: uuid("wallet_id").references(()=>wallet.id).notNull(),
    type: transactionTypeEnum("type").notNull(),
    amount: decimal("amount", { precision: 12, scale: 2}).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const idempotencyKeys = pgTable("idempotency_key", {
    key: varchar("key").primaryKey(),
    txnId: uuid("transaction_id").references(()=>transactions.id).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
})