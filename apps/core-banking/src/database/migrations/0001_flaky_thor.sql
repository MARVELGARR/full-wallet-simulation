ALTER TABLE "transactions" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."transaction_category";--> statement-breakpoint
CREATE TYPE "public"."transaction_category" AS ENUM('funding', 'withdrawal', 'p2p_transfere', 'bill', 'fee', 'refund', 'bonus');--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "category" SET DATA TYPE "public"."transaction_category" USING "category"::"public"."transaction_category";--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."transaction_type";--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('credit', 'debit', 'lock', 'reversal');--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "type" SET DATA TYPE "public"."transaction_type" USING "type"::"public"."transaction_type";--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "type" SET DATA TYPE "public"."transaction_type" USING "type"::"public"."transaction_type";