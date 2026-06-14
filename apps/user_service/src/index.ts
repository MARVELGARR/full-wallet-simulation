


import "dotenv/config"; // loads .env before anything else runs

import { app } from "./settings/app.config"
import express from "express";
import { serverLogger } from "./settings/pino.config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./settings/db.config";
import { InitRabbitMQ } from "./settings/rabbitQ.config"
import { router } from "./settings/router.config";
import { AuthRouter } from "./routers/auth_routers";






// ── Standard Middleware ───────────────────────────────────────
app.use(express.json());

router.get("/", (req, res)=>{
    res.send("wahala")
})

app.use(router)
app.use(AuthRouter)

// ── HTTP Port ─────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;

// ─────────────────────────────────────────────────────────────
// SERVER BOOT
// ─────────────────────────────────────────────────────────────
const start = async (): Promise<void> => {
    // Run pending Drizzle migrations (creates tables on first deploy)
    try {
        serverLogger.info("Running database migrations...");
        await migrate(db, { migrationsFolder: "./src/database/migrations" });
        serverLogger.info("✅ Migrations complete");
        
    } catch (err) {
        serverLogger.fatal({ err }, "❌ Migration failed");
        process.exit(1);
    }


    try{
        serverLogger.info(`RabbirMQ Initializing`)
        await InitRabbitMQ()
        serverLogger.info(`RabbirMQ connected`)
    }catch(error){
        serverLogger.fatal(`RabbirMQ failed to initialise `)
        process.exit(1);
    }

    app.listen(PORT, () => {
        serverLogger.info(`🚀 Running on http://localhost:${PORT}`);
    });
};

// ─────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────────────────────
const shutdown = async (signal: string): Promise<void> => {
    serverLogger.warn(`${signal} received — shutting down gracefully...`);
    process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

start();