

import amqp from "amqplib"

type RoutingKey = "user.created" | "user.logged_in" | "user.logged_out" | "transaction.completed" | "transaction.failed"

let conn: amqp.ChannelModel
let channel: amqp.Channel

const exchange = "user-service"
const bankingExchange = "banking-service"
const userQueueName = "banking-user-events"
const transactionQueueName = "banking-transaction-events"

export const InitRabbitMQ = async () => {
    try {
        const connectionURL = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672"
        conn = await amqp.connect(connectionURL)
        channel = await conn.createChannel()

        // ── Dead Letter Exchange (DLX) ───────────────────────
        const dlxExchange = "dlx-exchange";
        const dlxQueue = "dlx-queue";
        await channel.assertExchange(dlxExchange, "topic", { durable: true });
        await channel.assertQueue(dlxQueue, { durable: true });
        await channel.bindQueue(dlxQueue, dlxExchange, "#"); // Catch anything routed to DLX

        // ── User Service Exchange (consume from) ─────────────
        await channel.assertExchange(exchange, "topic", { durable: true })
        await channel.assertQueue(userQueueName, {
            durable: true,
            deadLetterExchange: dlxExchange // If we reject a message, it goes here
        })
        await channel.bindQueue(userQueueName, exchange, "user.created")

        // ── Banking Service Exchange (publish to) ────────────
        await channel.assertExchange(bankingExchange, "topic", { durable: true })
        await channel.assertQueue(transactionQueueName, {
            durable: true,
            deadLetterExchange: dlxExchange
        })
        await channel.bindQueue(transactionQueueName, bankingExchange, "transaction.completed")
        await channel.bindQueue(transactionQueueName, bankingExchange, "transaction.failed")

        console.log("[*] RabbitMQ Initialized — User + Banking queues bound (with DLX)");
    } catch (error) {
        console.error("Failed to initialize RabbitMQ:", error);
        throw error;
    }
}

/**
 * Subscribe to events on a specific queue.
 * Defaults to "banking-user-events" for backwards compatibility.
 */
export const subscribeToEvents = async (
    onMessage: (msg: any) => void,
    queue: string = userQueueName
) => {
    if (!channel) throw new Error("RabbitMQ channel not initialized");

    await channel.consume(queue, (msg: any) => {
        if (msg) {
            onMessage(msg);
            channel.ack(msg);
        }
    });
}


export const publishEvent = async (routeKey: RoutingKey, data: any) => {
    if (!channel) throw new Error("RabbitMQ not initiated, call initRabbitMq()")

    // Route to the correct exchange based on routing key
    const targetExchange = routeKey.startsWith("transaction.") ? bankingExchange : exchange;
    channel.publish(targetExchange, routeKey, Buffer.from(JSON.stringify(data)), { persistent: true })
}

export const closeRabbitMQ = async () => {
    if (channel) await channel.close();
    if (conn) await conn.close();
}