import { Router } from "express";
import {
    DepositController,
    WithdrawalController,
    TransferController,
    GetTransactionController,
    GetTransactionByRefController,
    GetTransactionHistoryController,
    CreateWalletController,
} from "../controllers/banking.controller";

// ─────────────────────────────────────────────────────────────
// BANKING ROUTER
// All core-banking API routes. Follows same pattern as
// user-service auth_routers.ts
// ─────────────────────────────────────────────────────────────

const bankingRouter = Router();

// ── Wallet ───────────────────────────────────────────────────
bankingRouter.post("/banking/wallet", CreateWalletController);

// ── Transactions (mutations) ─────────────────────────────────
bankingRouter.post("/banking/deposit", DepositController);
bankingRouter.post("/banking/withdraw", WithdrawalController);
bankingRouter.post("/banking/transfer", TransferController);

// ── Transactions (queries) ───────────────────────────────────
bankingRouter.get("/banking/transactions/:id", GetTransactionController);
bankingRouter.get("/banking/transactions/ref/:reference", GetTransactionByRefController);
bankingRouter.get("/banking/transactions/history/:userId", GetTransactionHistoryController);

export { bankingRouter };
