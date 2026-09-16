import onCron from "core/triggers/cron";
import { pruneTuyaHistory } from "utils/tuya/sensorSync";

/** DB hygiene only — device/sensor state itself is pushed live via Tuya Pulsar. */
export const tuyaHistoryPruneCron = onCron(
    {
        cron: "0 4 * * *", // once a day, off-hours
        id: "tuya-history-prune",
    },
    async (_, traceId) => {
        await pruneTuyaHistory(traceId);
    },
);
