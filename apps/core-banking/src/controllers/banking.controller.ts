import { Request, Response } from "express";
import { deposit_service } from "../service/deposit.service";
import { withdrawal_service } from "../service/withdrawal.service";
import { transfer_service } from "../service/transfer.service";
import { getTransactionById, getTransactionByReference, getTransactionHistory } from "../service/transaction.service";
import { createWallet } from "../service/wallet.service";
import { serverLogger } from "../settings/pino.config";

// ─────────────────────────────────────────────────────────────
// BANKING CONTROLLER
// Handles all HTTP requests for the core-banking service.
// Follows same error-mapping pattern as user-service controllers.
// ─────────────────────────────────────────────────────────────

const bankingLogger = serverLogger.child({ controller: "banking" });

// ── DEPOSIT ──────────────────────────────────────────────────
export const DepositController = async (req: Request, res: Response) => {
    try {
        const result = await deposit_service(req.body);

        if (!result.success) {
            const isValidation = result.error === "Validation failed";
            const isDuplicate = result.error === "Duplicate request";
            const isNotFound = result.error === "Wallet not found";

            const statusCode = isValidation
                ? 400
                : isDuplicate
                    ? 409
                    : isNotFound
                        ? 404
                        : 500;

            res.status(statusCode).json({
                success: false,
                error: result.error,
                ...(result.details ? { details: result.details } : {}),
            });
            return;
        }

        res.status(201).json({
            success: true,
            data: result.data,
        });
    } catch (err) {
        bankingLogger.error({ err }, "Unhandled error in POST /banking/deposit");
        res.status(500).json({
            success: false,
            error: "An unexpected error occurred. Please try again later.",
        });
    }
};

// ── WITHDRAWAL ───────────────────────────────────────────────
export const WithdrawalController = async (req: Request, res: Response) => {
    try {
        const result = await withdrawal_service(req.body);

        if (!result.success) {
            const isValidation = result.error === "Validation failed";
            const isDuplicate = result.error === "Duplicate request";
            const isNotFound = result.error === "Wallet not found";
            const isInsufficient = result.error === "Insufficient funds";

            const statusCode = isValidation
                ? 400
                : isDuplicate
                    ? 409
                    : isNotFound
                        ? 404
                        : isInsufficient
                            ? 422
                            : 500;

            res.status(statusCode).json({
                success: false,
                error: result.error,
                ...(result.details ? { details: result.details } : {}),
            });
            return;
        }

        res.status(201).json({
            success: true,
            data: result.data,
        });
    } catch (err) {
        bankingLogger.error({ err }, "Unhandled error in POST /banking/withdraw");
        res.status(500).json({
            success: false,
            error: "An unexpected error occurred. Please try again later.",
        });
    }
};

// ── TRANSFER (P2P) ──────────────────────────────────────────
export const TransferController = async (req: Request, res: Response) => {
    try {
        const result = await transfer_service(req.body);

        if (!result.success) {
            const isValidation = result.error === "Validation failed";
            const isDuplicate = result.error === "Duplicate request";
            const isSenderNotFound = result.error === "Sender wallet not found";
            const isReceiverNotFound = result.error === "Receiver wallet not found";
            const isInsufficient = result.error === "Insufficient funds";

            const statusCode = isValidation
                ? 400
                : isDuplicate
                    ? 409
                    : (isSenderNotFound || isReceiverNotFound)
                        ? 404
                        : isInsufficient
                            ? 422
                            : 500;

            res.status(statusCode).json({
                success: false,
                error: result.error,
                ...(result.details ? { details: result.details } : {}),
            });
            return;
        }

        res.status(201).json({
            success: true,
            data: result.data,
        });
    } catch (err) {
        bankingLogger.error({ err }, "Unhandled error in POST /banking/transfer");
        res.status(500).json({
            success: false,
            error: "An unexpected error occurred. Please try again later.",
        });
    }
};

// ── GET TRANSACTION BY ID ────────────────────────────────────
export const GetTransactionController = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const result = await getTransactionById(id);

        if (!result.success) {
            const isNotFound = result.error === "Transaction not found";
            res.status(isNotFound ? 404 : 500).json({
                success: false,
                error: result.error,
                ...(result.details ? { details: result.details } : {}),
            });
            return;
        }

        res.status(200).json({
            success: true,
            data: result.data,
        });
    } catch (err) {
        bankingLogger.error({ err }, "Unhandled error in GET /banking/transactions/:id");
        res.status(500).json({
            success: false,
            error: "An unexpected error occurred. Please try again later.",
        });
    }
};

// ── GET TRANSACTION BY REFERENCE ─────────────────────────────
export const GetTransactionByRefController = async (req: Request, res: Response) => {
    try {
        const reference = req.params.reference as string;
        const result = await getTransactionByReference(reference);

        if (!result.success) {
            const isNotFound = result.error === "Transaction not found";
            res.status(isNotFound ? 404 : 500).json({
                success: false,
                error: result.error,
                ...(result.details ? { details: result.details } : {}),
            });
            return;
        }

        res.status(200).json({
            success: true,
            data: result.data,
        });
    } catch (err) {
        bankingLogger.error({ err }, "Unhandled error in GET /banking/transactions/ref/:reference");
        res.status(500).json({
            success: false,
            error: "An unexpected error occurred. Please try again later.",
        });
    }
};

// ── GET TRANSACTION HISTORY (PAGINATED) ──────────────────────
export const GetTransactionHistoryController = async (req: Request, res: Response) => {
    try {
        const result = await getTransactionHistory({
            userId: req.params.userId,
            page: req.query.page ? Number(req.query.page) : undefined,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
        });

        if (!result.success) {
            const isNotFound = result.error === "Wallet not found";
            const isValidation = result.error === "Validation failed";
            const statusCode = isValidation ? 400 : isNotFound ? 404 : 500;

            res.status(statusCode).json({
                success: false,
                error: result.error,
                ...(result.details ? { details: result.details } : {}),
            });
            return;
        }

        res.status(200).json({
            success: true,
            data: result.data,
        });
    } catch (err) {
        bankingLogger.error({ err }, "Unhandled error in GET /banking/transactions/history/:userId");
        res.status(500).json({
            success: false,
            error: "An unexpected error occurred. Please try again later.",
        });
    }
};

// ── CREATE WALLET ────────────────────────────────────────────
export const CreateWalletController = async (req: Request, res: Response) => {
    try {
        const result = await createWallet(req.body);

        if (!result.success) {
            const isValidation = result.error === "Validation failed";
            res.status(isValidation ? 400 : 500).json({
                success: false,
                error: result.error,
                ...(result.details ? { details: result.details } : {}),
            });
            return;
        }

        res.status(201).json({
            success: true,
            data: result.data,
        });
    } catch (err) {
        bankingLogger.error({ err }, "Unhandled error in POST /banking/wallet");
        res.status(500).json({
            success: false,
            error: "An unexpected error occurred. Please try again later.",
        });
    }
};
