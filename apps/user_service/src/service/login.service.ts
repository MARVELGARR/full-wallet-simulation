

import * as z from "zod"
import { findUserByEmail } from "../data-access-layer/user.data-access-layer"
import { comparePassword } from "../utils/bcrypt.utils"
import { signAccessToken, signRefreshToken } from "../utils/jwt.utils"


const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
})

type loginType = z.infer<typeof LoginSchema>


type ServiceSuccess<T> = { success: true; data: T };
type ServiceError = { success: false; error: string; details?: unknown };
type ServiceResult<T> = ServiceSuccess<T> | ServiceError;


interface LoginSuccessPayload {

    user: {
        id: string;
        name: string;
        email: string;
    };
    accessToken: string;
    refreshToken: string;
}


export const login_service = async (data: loginType): Promise<ServiceResult<LoginSuccessPayload>> => {

    const parsed_data = LoginSchema.safeParse(data)
    if(!parsed_data.success){
        return {
            success: false,
            error: "Validation failed",
            details: parsed_data.error.flatten().fieldErrors,
        }
    }

    const {email, password} = parsed_data.data

    const user = await findUserByEmail(email)
    if(!user){
        return {
            success: false,
            error: "User not found",
            details: "User not found",
        }
    }

    const isPasswordValid = await comparePassword(password, user.password)
    if(!isPasswordValid){
        return {
            success: false,
            error: "Invalid password",
            details: "Invalid password",
        }
    }

    const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        name: user.name,
    })

    const refreshToken = signRefreshToken({
        sub: user.id,
        email: user.email,
        name: user.name,
    })

    return {
        success: true,
        data: {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
            accessToken,
            refreshToken,
        },
    }
    
}