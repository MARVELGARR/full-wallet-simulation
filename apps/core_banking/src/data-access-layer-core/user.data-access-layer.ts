import { users } from "../database/schema"
import { db } from "../settings/db.config"
import { eq } from "drizzle-orm"



export const findUserByEmail = async (email: string) =>{
    const [user] = await db.select().from(users).where(eq(users.email, email))
    return user
}
export const findUserById = async (userId: string) =>{
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    return user
}


export const createNewUser = async ({email, name, password}: {email: string, name: string, password: string}) =>{

    const [newUser] = await db.insert(users).values({
        email,
        name,
        password,
    }).returning()

    return newUser
}