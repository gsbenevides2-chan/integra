import TuyaMessageSubscribeWebsocket from "utils/tuya/pulsar/client";
import { TUYA_PASULAR_ENV, TuyaRegionConfigEnum } from "utils/tuya/pulsar/config";
import { handlePulsarMessage, logPulsarEvent, type PulsarMessage } from "utils/tuya/pulsar/handler";
import safeEnvGet from "utils/safeEnvGet";

const REGIONS = {
    us: TuyaRegionConfigEnum.US,
    eu: TuyaRegionConfigEnum.EU,
    cn: TuyaRegionConfigEnum.CN,
    in: TuyaRegionConfigEnum.IN,
} as const;

/** Starts the Tuya Pulsar (real-time push) connection once for the whole app lifetime. */
export function startTuyaPulsar(): void {
    const region = REGIONS[(process.env.TUYA_DATA_CENTER as keyof typeof REGIONS) ?? "us"];

    const client = new TuyaMessageSubscribeWebsocket({
        accessId: safeEnvGet("TUYA_ACCESS_ID"),
        accessKey: safeEnvGet("TUYA_ACCESS_SECRET"),
        url: region,
        env: process.env.TUYA_PULSAR_ENV === "test" ? TUYA_PASULAR_ENV.TEST : TUYA_PASULAR_ENV.PROD,
        maxRetryTimes: 100,
    });

    client.open(() => void logPulsarEvent("Tuya Pulsar connected", {}));
    client.reconnect(() => void logPulsarEvent("Tuya Pulsar reconnected", {}));

    client.message((_ws, raw) => {
        const message = raw as PulsarMessage;
        client.ackMessage(message.messageId);
        void logPulsarEvent("Tuya Pulsar message", { message });
        void handlePulsarMessage(message);
    });

    client.error(
        (_ws, error) =>
            void logPulsarEvent("Tuya Pulsar error", {
                error: error instanceof Error ? error.message : String(error),
            }),
    );

    client.start();
}
