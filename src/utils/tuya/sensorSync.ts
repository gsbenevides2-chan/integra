import { addTracerEvent } from "core/instrumentation";
import { pruneReadings } from "utils/tuya/sensors";
import { pruneStateHistory } from "utils/tuya/state";

const READING_RETENTION_DAYS = 90;
const HISTORY_RETENTION_DAYS = 30;

/**
 * Pure DB hygiene, no polling: device and sensor state now arrives entirely through the
 * Pulsar push connection, so this only bounds how much history piles up.
 */
export async function pruneTuyaHistory(traceId: string): Promise<void> {
    const readingsCutoff = new Date(Date.now() - READING_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const stateCutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    await pruneReadings(readingsCutoff);
    await pruneStateHistory(stateCutoff);

    await addTracerEvent({
        traceId,
        eventName: "Tuya history pruned",
        eventType: "INFO",
        eventData: { readingsCutoff, stateCutoff },
    });
}
