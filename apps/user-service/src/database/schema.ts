import { boolean, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";






export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name:      text("name").notNull(),
  email:     text("email").notNull().unique(),   // enforce unique email at DB level
  password:  text("password").notNull(),          // bcrypt hash stored here
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
   id: uuid("id").primaryKey().defaultRandom(),
    userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    token:     text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    revoked:   boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});
