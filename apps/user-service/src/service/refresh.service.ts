import { findRefreshToken, revokeRefreshToken, saveRefreshToken } from "../data-access-layer/auth";
import { JwtPayload, signAccessToken, signRefreshToken, verifyToken } from "../utils/jwt.utils";


type ServiceSuccess<T> = { success: true; data: T };
type ServiceError = { success: false; error: string };
type ServiceResult<T> = ServiceSuccess<T> | ServiceError;

export const RefreshSession = async (
    refreshToken: string
): Promise<ServiceResult<{ accessToken: string; refreshToken: string }>> => {

    // 1. Verify token validity
    let payload: JwtPayload;
    try {
        payload = verifyToken(refreshToken);
    } catch (err) {
        return { success: false, error: "Invalid or expired refresh token." };
    }

    // 2. Check DB
    const dbToken = await findRefreshToken(refreshToken);
    if (!dbToken) {
        return { success: false, error: "Session is no longer valid." };
    }

    // 3. Revoke the old token (Token Rotation)
    await revokeRefreshToken(refreshToken);

    // 4. Generate new pair
    const newAccessToken = signAccessToken({
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
    });

    const newRefreshToken = signRefreshToken({
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
    });

    // 5. Save the new refresh token
    await saveRefreshToken({
        userId: payload.sub,
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    return {
        success: true,
        data: {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        },
    };
};
