import { addTracerEvent, endTracer, serializeError, startTracer } from "core/instrumentation";
import type { TracerStatus } from "core/instrumentation/types";
import type { Trigger, TriggerSettings } from "core/triggers";

export interface IntervalSettings extends TriggerSettings {
    intervalMs: number;
    runTriggerOnEnds?: string;
}

export interface IntervalTrigger extends Trigger {
    intervalId?: NodeJS.Timeout;
}

export type IntervalCall = (traceId: string) => Promise<void>;

export default function onInterval(
    settings: IntervalSettings,
    func: IntervalCall,
): IntervalTrigger {
    let intervalId: NodeJS.Timeout | undefined;

    return {
        id: settings.id,
        intervalId,
        register: async () => {
            intervalId = setInterval(async () => {
                let status: TracerStatus = "SUCCESS";
                const traceId = crypto.randomUUID();
                await startTracer({
                    inputData: {
                        intervalMs: settings.intervalMs,
                    },
                    traceId,
                    triggerId: settings.id,
                    workflowType: "interval",
                });
                try {
                    await func(traceId);
                } catch (error: unknown) {
                    await addTracerEvent({
                        traceId,
                        eventData: serializeError(error),
                        eventName: "Interval on Error",
                        eventType: "ERROR",
                    });
                    status = "ERROR";
                } finally {
                    await endTracer({
                        outputData: {},
                        status,
                        traceId,
                    });
                    if (settings.runTriggerOnEnds) {
                        const trigger = global.triggers.find(
                            (t) => t.id === settings.runTriggerOnEnds,
                        );
                        if (trigger && trigger.test) {
                            trigger.test();
                        }
                    }
                }
            }, settings.intervalMs);
        },
        test: async () => {
            let status: TracerStatus = "SUCCESS";
            const traceId = crypto.randomUUID();
            await startTracer({
                inputData: {
                    intervalMs: settings.intervalMs,
                },
                traceId,
                triggerId: settings.id,
                workflowType: "interval",
            });
            try {
                await func(traceId);
            } catch (error: unknown) {
                await addTracerEvent({
                    traceId,
                    eventData: serializeError(error),
                    eventName: "Interval on Error",
                    eventType: "ERROR",
                });
                status = "ERROR";
            } finally {
                await endTracer({
                    outputData: {},
                    status,
                    traceId,
                });
            }
        },
        type: "interval",
    };
}
