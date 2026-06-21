import { subscribeToEvents } from "../settings/rabbitQ.config";
import { serverLogger } from "../settings/pino.config";

// ─────────────────────────────────────────────────────────────
// TRANSACTION EVENT HANDLERS
// Listens for transaction-related events from RabbitMQ.
// Can be used for notifications, audit logging, analytics, etc.
// ─────────────────────────────────────────────────────────────

export const initTransactionEventHandlers = async () => {
    const txnEventLogger = serverLogger.child({ module: "transaction-events" });
    txnEventLogger.info("Initializing Transaction Event Handlers...");

    // Subscribe to the transaction events queue
    await subscribeToEvents(async (msg) => {
        if (!msg) return;

        try {
            const content = msg.content.toString();
            const event = JSON.parse(content);

            txnEventLogger.info({ event }, "Received Transaction Event");

            // Handle different transaction event types
            if (event.type === "p2p_transfer") {
                txnEventLogger.info(
                    {
                        senderUserId: event.senderUserId,
                        receiverUserId: event.receiverUserId,
                        amount: event.amount,
                    },
                    "P2P Transfer event processed — ready for notification dispatch"
                );
                // TODO: Forward to notification-service when ready
            }

            if (event.category === "funding") {
                txnEventLogger.info(
                    { userId: event.userId, amount: event.amount },
                    "Deposit event processed — ready for notification dispatch"
                );
            }

            if (event.category === "withdrawal") {
                txnEventLogger.info(
                    { userId: event.userId, amount: event.amount },
                    "Withdrawal event processed — ready for notification dispatch"
                );
            }
        } catch (error) {
            txnEventLogger.error({ error }, "Error processing transaction event");
        }
    }, "banking-transaction-events");
};
