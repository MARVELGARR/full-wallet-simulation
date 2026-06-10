


import pino from "pino";

// ─────────────────────────────────────────────────────────────
// CENTRALIZED PINO LOGGER
//
// Single source of truth for application logging.
// In development: uses pino-pretty for human-readable output.
// In production:  outputs structured JSON for log aggregation.
//
// Usage:
//   import { logger } from "../settings/logger.js";
//   logger.info("Server started");
//   logger.error({ err }, "Something failed");
//
// Child loggers for specific modules:
//   const log = logger.child({ module: "auth-service" });
//   log.info("User registered");
// ─────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
    level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
    transport: isDev
        ? {
              target: "pino-pretty",
              options: {
                  colorize: true,
                  translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
                  ignore: "pid,hostname",
              },
          }
        : undefined, // In production, output raw JSON for log aggregation
});

// ─────────────────────────────────────────────────────────────
// PRE-CONFIGURED CHILD LOGGERS
// Each module gets its own child logger with the module name
// automatically attached to every log line.
// ─────────────────────────────────────────────────────────────

export const serverLogger       = logger.child({ module: "server" });
export const dbLogger           = logger.child({ module: "db" });
export const authLogger         = logger.child({ module: "auth" });
export const userLogger         = logger.child({ module: "user" });
