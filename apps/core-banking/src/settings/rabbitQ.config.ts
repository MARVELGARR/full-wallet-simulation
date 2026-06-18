


import amqp from "amqplib"

type RoutingKey = "user.created" | "user.logged_in" | "user.logged_out"

let conn: any
let channel: any

const exchange = "user-service"
const queueName = "banking-user-events"

export const InitRabbitMQ = async () => {
    try {
        const connectionURL = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672"
        conn = await amqp.connect(connectionURL)
        channel = await conn.createChannel()

        await channel.assertExchange(exchange, "topic", { durable: true })
        
        await channel.assertQueue(queueName, { durable: true })
        
        await channel.bindQueue(queueName, exchange, "user.created")
        
        console.log("[*] RabbitMQ Initialized and Queue bound");
    } catch (error) {
        console.error("Failed to initialize RabbitMQ:", error);
        throw error;
    }
}

export const subscribeToEvents = async (onMessage: (msg: any) => void) => {
    if (!channel) throw new Error("RabbitMQ channel not initialized");
    
    await channel.consume(queueName, (msg: any) => {
        if (msg) {
            onMessage(msg);
            channel.ack(msg);
        }
    });
}


export const publishEvent = async (routeKey: RoutingKey, data: any) => {
    if (!channel) throw new Error("RabbitMQ not initiated, call initRabbitMq()")
    channel.publish(exchange, routeKey, Buffer.from(JSON.stringify(data)), { persistent: true })
}

export const closeRabbitMQ = async () => {
    if (channel) await channel.close();
    if (conn) await conn.close();
}