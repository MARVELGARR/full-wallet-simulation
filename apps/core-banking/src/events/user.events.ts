



import { subscribeToEvents } from "../settings/rabbitQ.config"
import { createWallet } from "../service/wallet.service"
import { serverLogger } from "../settings/pino.config"

/**
 * Initializes the user event subscribers.
 * Listens for 'user.created' to automatically create a wallet for new users.
 */
export const initUserEventHandlers = async () => {
    serverLogger.info("Initializing User Event Handlers...");

    await subscribeToEvents(async (msg) => {
        if (!msg) return;

        try {
            const content = msg.content.toString();
            const event = JSON.parse(content);
            
            serverLogger.info({ event }, "Received RabbitMQ Event");

            // Check if it's a user creation event
            // Note: In our subscribeToEvents we already filter by routing key 'user.created' 
            // for the current queue binding, but we can verify the payload structure.
            
            if (event.id || event.userId) {
                const userId = event.id || event.userId;
                
                serverLogger.info(`Creating wallet for user: ${userId}`);
                
                await createWallet({
                    userId: userId,
                    currency: event.currency || "NGN"
                });

                serverLogger.info(`Successfully created wallet for user: ${userId}`);
            }
        } catch (error) {
            serverLogger.error({ error }, "Error processing RabbitMQ message");
        }
    });
}
