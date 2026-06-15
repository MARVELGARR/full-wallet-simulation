

import * as z from"zod"
import { hashPassword } from "../utils/bcrypt.utils";
import { createNewUser, findUserByEmail } from "../data-access-layer/user.data-access-layer";
import { signAccessToken, signRefreshToken } from "../utils/jwt.utils";
import { publishEvent } from "../settings/rabbitQ.config";

const RegisterSchema = z.object({
     name: z
        .string({ error: "Name is required" })
        .min(2, { message: "Name must be at least 2 characters" })
        .max(10, { message: "Name must be at most 10 characters" })
        .trim(),

    email: z
        .string({ error: "Email is required" })
        .email({ message: "Invalid email format" })
        .toLowerCase(), // normalise to lowercase before storing

    password: z
        .string({ error: "Password is required" })
        .min(5, { message: "Password must be at least 5 characters" })
        .max(72, { message: "Password cannot exceed 72 characters (bcrypt limit)" }),
})

// Infer the TypeScript type directly from the schema — keeps them in sync.
type RegisterType = z.infer<typeof RegisterSchema>


// ─────────────────────────────────────────────────────────────
// SERVICE RESPONSE TYPES
// Using a discriminated union so callers get proper type narrowing:
//   if (result.success) { result.data ... }  ← TypeScript knows data exists
//   if (!result.success) { result.error ... } ← TypeScript knows error exists
// ─────────────────────────────────────────────────────────────

type ServiceSuccess<T> = { success: true; data: T };
type ServiceError = { success: false; error: string; details?: unknown };
type ServiceResult<T> = ServiceSuccess<T> | ServiceError;

// Shape of the data we return to the controller on success
interface RegisterSuccessPayload {

    user: {
        id: string;
        name: string;
        email: string;
    };
    accessToken: string;
    refreshToken: string;
}

export const register_service = async  (data: unknown):Promise<ServiceResult<RegisterSuccessPayload>> =>{

    const parsed_data = RegisterSchema.safeParse(data);
    if (!parsed_data.success) {
        return {
            success: false,
            error: "Validation failed",
            details: parsed_data .error.flatten().fieldErrors, // field-level errors for the frontend
        };
    }

    const {email, name, password} = parsed_data.data;


    const existingUser = await findUserByEmail(email)
    if(existingUser){
        return {
            success: false,
            error: "User already exists",
            details: "User already exists",
        };
    }

    let hashpassword

    try{
        hashpassword = await hashPassword(password)
    }catch(error){
        return {
            success: false,
            error: "Failed to hash password",
            details: error,
        };
    }

    const newUser = await createNewUser({email, name, password: hashpassword})

    publishEvent("user.created", {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        date:new Date().toISOString(),
    })
    if(!newUser){
        return {
            success: false,
            error: "Failed to create new user",
            details: "Failed to create new user",
        };
    }

    const accessToken = signAccessToken({sub: newUser.id, email: newUser.email, name: newUser.name})
    const refreshToken = signRefreshToken({sub: newUser.id, email: newUser.email, name: newUser.name})

    return {
        success: true,
        data: {
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
            },
            accessToken,
            refreshToken,
        },
    }

}