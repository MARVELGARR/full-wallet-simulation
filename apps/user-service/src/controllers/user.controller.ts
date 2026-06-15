import { login_service } from "../service/login.service";
import { logout_service } from "../service/logout.service";
import { RefreshSession } from "../service/refresh.service";
import { register_service } from "../service/register.service"
import { authLogger } from "../settings/pino.config";
import { Request, Response } from "express"


export const RegisterController = async (req: Request, res: Response) =>{ 

     try {
            // Pass the raw request body directly to the service.
            // The service validates it with Zod — the controller trusts nothing.
            const result = await register_service(req.body);

            if (!result.success) {
                // Decide the HTTP status based on the error message/type
                // that came back from the service layer.
                const isEmailTaken = result.error === "An account with this email already exists.";
                const isValidationError = result.error === "Validation failed";

                const statusCode = isEmailTaken
                    ? 409  // Conflict
                    : isValidationError
                        ? 400  // Bad Request
                        : 500; // Internal Server Error (unexpected)

                res.status(statusCode).json({
                    success: false,
                    error:   result.error,
                    // `details` only present for validation errors, not for internal ones
                    ...(result.details ? { details: result.details } : {}),
                });
                return;
            }

            // 201 Created — user registered successfully
            res.status(201).json({
                success: true,
                data:    result.data, // { user: { id, name, email }, token }
            });

        } catch (err) {
            // Last-resort catch — should never reach here if service layer
            // is handling its own errors, but we never leave a request hanging.
            authLogger.error({ err }, "Unhandled error in /auth/register");
            res.status(500).json({
                success: false,
                error: "An unexpected error occurred. Please try again later.",
            });
        }

}


export const LoginController = async (req: Request, res: Response) =>{
    try {
        const result = await login_service(req.body)

        if(!result.success){
            const isValidationError = result.error === "Validation failed";
            const isUserNotFound = result.error === "User not found";
            const isInvalidCredentials = result.error === "Invalid credentials";
            const isInternalError = result.error === "An unexpected error occurred. Please try again later.";

            const statusCode = isValidationError
                ? 400  // Bad Request
                : isUserNotFound
                    ? 404  // Not Found
                    : isInvalidCredentials
                        ? 401  // Unauthorized
                        : isInternalError
                            ? 500  // Internal Server Error (unexpected)
                            : 500; // Internal Server Error (unexpected)

            res.status(statusCode).json({
                success: false,
                error:   result.error,
                // `details` only present for validation errors, not for internal ones
                ...(result.details ? { details: result.details } : {}),
            });
            return;
        }

        res.status(200).json({
            success: true,
            data:    result.data, // { user: { id, name, email }, accessToken, refreshToken }
        });
    } catch (error) {
        authLogger.error({ err: error }, "Unhandled error in /auth/login");
        res.status(500).json({
            success: false,
            error: "An unexpected error occurred. Please try again later.",
        });
    }
}

export const LogOutController = async (req: Request, res: Response) =>{
    try {
        const Token = req.headers.authorization;

        const refreshToken = Token?.split(" ")[1]

        if (!refreshToken) {
            res.status(400).json({ success: false, error: "Access token is required." });
            return;
        }

        const result = await logout_service(refreshToken);

        if (!result.success) {
            res.status(400).json({ success: false, error: result.error });
            return;
        }

        res.status(200).json({ success: true, message: "Logged out successfully." });
    } catch (error) {
        authLogger.error({ err: error }, "Unhandled error in /auth/logout");
        res.status(500).json({ success: false, error: "An unexpected error occurred." });
    }
}
export const RefreshTokenController = async (req: Request, res: Response) =>{
      try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            res.status(400).json({ success: false, error: "Refresh token is required." });
            return;
        }

        const result = await RefreshSession(refreshToken);

        if (!result.success) {
            res.status(401).json({ success: false, error: result.error });
            return;
        }

        res.status(200).json({
            success: true,
            data:    result.data, // { accessToken, refreshToken }
        });
    } catch (error) {
        authLogger.error({ err: error }, "Unhandled error in /auth/refresh");
        res.status(500).json({ success: false, error: "An unexpected error occurred." });
    }
}