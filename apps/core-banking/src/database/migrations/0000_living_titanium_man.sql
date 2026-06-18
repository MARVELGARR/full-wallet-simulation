CREATE TYPE "public"."transaction_category" AS ENUM('fund', 'withdrawal', 'p2p', 'bill', 'fee');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('credit', 'debit', 'transfer', 'reversal');--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" varchar PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar NOT NULL,
	"wallet_id" uuid NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"balance_before" numeric(20, 4) NOT NULL,
	"balance_after" numeric(20, 4) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"category" "transaction_category" NOT NULL,
	"narration" text,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"reversal_of" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"balance" numeric(20, 4) DEFAULT '0.0000' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_txn_id_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_wallet_id_idx" ON "ledger_entries" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "txn_wallet_id_idx" ON "transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "txn_reference_idx" ON "transactions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "wallet_user_id_idx" ON "wallets" USING btree ("user_id");