


import amqp from "amqplib"
import { rabbitMQLogger } from "./pino.config"




type RoutingKey = "user.created" | "user.logged_in" | "user.logged_out"


let conn: amqp.ChannelModel
let channel: amqp.Channel


const exchange = "user-service"

export  const InitRabbitMQ = async() =>{

    conn  = await amqp.connect(process.env.RABBITMQ_URL!)

    channel = await conn.createChannel()

    await channel.assertExchange("user-service", "topic", {durable: true})
    
    
}

export const  publishEvent = async (routeKey: RoutingKey, data: any) =>{

    if(!channel){
        rabbitMQLogger.error("RabbitMQ not initiated, call initRabbitMq()")
        throw new Error(` RabbitMQ not initiated, call initRabbitMq()`)
    } 
    
    
    channel.publish(exchange, routeKey, Buffer.from(JSON.stringify(data)), {persistent: true})
    rabbitMQLogger.info("RabbitMQ just published a message")

}

export const closeRabbitMQ = async () =>{
    await channel.close()
    await conn.close()
}