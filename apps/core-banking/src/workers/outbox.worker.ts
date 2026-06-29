import { db } from "../settings/db.config";
import { outboxEvents } from "../database/schema";
import { eq, and, asc } from "drizzle-orm";
import { publishEvent } from "../settings/rabbitQ.config";
import { serverLogger } from "../settings/pino.config";

const outboxLogger = serverLogger.child({ module: "outbox-worker" });

/**
 * ─────────────────────────────────────────────────────────────────
 * TRANSACTIONAL OUTBOX WORKER
 * ─────────────────────────────────────────────────────────────────
 * This worker polls the `outbox_events` table for any 'pending'
 * events. Since these events were inserted into the database as 
 * part of the exact same transaction that updated the wallet balances,
 * we are 100% guaranteed that no events are lost if RabbitMQ acts up.
 */
export const startOutboxWorker = () => {
    outboxLogger.info("Starting Transactional Outbox Worker...");

    // Poll every 5 seconds
    setInterval(async () => {
        try {
            // Fetch up to 50 pending events, oldest first
            const pendingEvents = await db.select()
                .from(outboxEvents)
                .where(eq(outboxEvents.status, "pending"))
                .orderBy(asc(outboxEvents.createdAt))
                .limit(50);

            if (pendingEvents.length === 0) return;

            for (const event of pendingEvents) {
                try {
                    // Try to publish via RabbitMQ
                    publishEvent(event.eventType as any, event.payload);

                    // If successful, mark as processed
                    await db.update(outboxEvents)
                        .set({
                            status: "processed",
                            processedAt: new Date()
                        })
                        .where(eq(outboxEvents.id, event.id));

                } catch (publishErr) {
                    outboxLogger.error({ eventId: event.id, error: publishErr }, "Failed to publish outbox event");
                    // We DO NOT mark as failed immediately because we want it to retry on the next tick.
                }
            }
        } catch (error) {
            outboxLogger.error({ error }, "Error polling outbox_events table");
        }
    }, 5000);
};
