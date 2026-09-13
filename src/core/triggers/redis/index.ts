import { redis } from "bun";
import type { Trigger, TriggerSettings } from "core/triggers";
import { startTracer, addTracerEvent, endTracer, serializeError } from "core/instrumentation";
import type { TracerStatus } from "core/instrumentation/types";

export interface RedisSettings extends TriggerSettings {
    channel: string;
}

export interface RedisSubscription {
    channel: string;
    call: RedisCall;
    triggerId: string;
}

export interface RedisTrigger extends Trigger {}

export type RedisCall = (message: string, channel: string, traceId: string) => Promise<void>;

declare global {
    var redisSubscriptions: RedisSubscription[] | undefined;
}

export default function onRedis(settings: RedisSettings, func: RedisCall): RedisTrigger {
    return {
        id: settings.id,
        register: async () => {
            if (!global.redisSubscriptions) global.redisSubscriptions = [];

            global.redisSubscriptions = [
                ...global.redisSubscriptions,
                {
                    channel: settings.channel,
                    call: func,
                    triggerId: settings.id,
                },
            ];
        },
    };
}

export async function startRedisClients() {
    if (!global.redisSubscriptions) return;

    const subs = global.redisSubscriptions;
    if (subs.length === 0) return;

    const nonDuplicatedChannels = subs.filter(
        (sub, index, arr) => index === arr.findIndex((s) => s.channel === sub.channel),
    );

    for (const sub of nonDuplicatedChannels) {
        await redis.subscribe(sub.channel, async (message, channel) => {
            const channelSubs = subs.filter((s) => s.channel === channel);
            await Promise.all(
                channelSubs.map(async (s) => {
                    const traceId = crypto.randomUUID();
                    await startTracer({
                        inputData: {
                            subs: sub,
                            message,
                            channel,
                        },
                        traceId,
                        triggerId: sub.triggerId,
                        workflowType: "Redis",
                    });
                    let status: TracerStatus = "SUCCESS";
                    try {
                        await s.call(message, channel, traceId);
                    } catch (error: unknown) {
                        status = "ERROR";
                        await addTracerEvent({
                            eventData: serializeError(error),
                            eventName: "Redis on Error",
                            eventType: "ERROR",
                            traceId,
                        });
                    } finally {
                        await endTracer({
                            outputData: {},
                            status,
                            traceId,
                        });
                    }
                }),
            );
        });

        process.on("SIGTERM", () => redis.close());
        process.on("SIGKILL", () => redis.close());
    }
}
