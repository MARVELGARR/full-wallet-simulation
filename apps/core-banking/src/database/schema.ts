import { decimal, pgEnum, pgTable, text, timestamp, uuid, varchar, index, jsonb } from "drizzle-orm/pg-core";

export const transactionTypeEnum = pgEnum("transaction_type", ["credit", "debit", "transfer", "reversal"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "completed", "failed"]);
export const transactionCategoryEnum = pgEnum("transaction_category", ["fund", "withdrawal", "p2p", "bill", "fee"]);

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // Removed .unique() to allow multiple wallets per user
  balance: decimal("balance", { precision: 20, scale: 4 }).default("0.0000").notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("wallet_user_id_idx").on(table.userId),
}));

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: varchar("reference").unique().notNull(), // Fixed typo from 'refrence'
  walletId: uuid("wallet_id").references(() => wallets.id).notNull(),
  amount: decimal("amount", { precision: 20, scale: 4 }).notNull(),
  balanceBefore: decimal("balance_before", { precision: 20, scale: 4 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 20, scale: 4 }).notNull(),
  type: transactionTypeEnum("type").notNull(),
  category: transactionCategoryEnum("category").notNull(),
  narration: text("narration"),
  status: transactionStatusEnum("status").default("pending").notNull(),
  metadata: jsonb("metadata"), // Added for extensibility
  reversalOf: uuid("reversal_of"), // Link to original transaction if this is a reversal
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  walletIdIdx: index("txn_wallet_id_idx").on(table.walletId),
  referenceIdx: index("txn_reference_idx").on(table.reference),
}));

export const ledger = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  txnId: uuid("transaction_id").references(() => transactions.id).notNull(),
  walletId: uuid("wallet_id").references(() => wallets.id).notNull(),
  type: transactionTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 20, scale: 4 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  txnIdIdx: index("ledger_txn_id_idx").on(table.txnId),
  walletIdIdx: index("ledger_wallet_id_idx").on(table.walletId),
}));

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: varchar("key").primaryKey(),
  txnId: uuid("transaction_id").references(() => transactions.id).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});