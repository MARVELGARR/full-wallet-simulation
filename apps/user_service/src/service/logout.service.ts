import { revokeRefreshToken } from "../data-access-layer/auth";
import { findUserById } from "../data-access-layer/user.data-access-layer";
import { authLogger } from "../settings/pino.config";
import { publishEvent } from "../settings/rabbitQ.config";

type ServiceSuccess<T> = { success: true; data: T };
type ServiceError = { success: false; error: string; details?: unknown };
type ServiceResult<T> = ServiceSuccess<T> | ServiceError;

export const logout_service = async (refreshToken: string): Promise<ServiceResult<{ message: string }>> =>{

     try {
        await revokeRefreshToken(refreshToken);
        await publishEvent("user.logged_out", {
            data: new Date().toISOString()
        })
        return {
             success: true,
             data:{
                message: "logged out"
             } 
            };
    } catch (err) {
        authLogger.error({ err }, "Logout failed");
        return { success: false, error: "Logout failed." };
    }

}