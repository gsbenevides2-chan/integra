import safeEnvGet from "@server/safeEnvGet";

import { type Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

import { getLogger, logError } from "../../../../instrumentation/instrumentLogger";
import { pulsarEvents } from "../../../../instrumentation/metrics";
import TuyaMessageSubscribeWebsocket from "./client";
import { TUYA_PASULAR_ENV, TuyaRegionConfigEnum } from "./config";
import { handlePulsarMessage, type PulsarMessage } from "./handler";

const REGIONS = {
  us: TuyaRegionConfigEnum.US,
  eu: TuyaRegionConfigEnum.EU,
  cn: TuyaRegionConfigEnum.CN,
  in: TuyaRegionConfigEnum.IN,
} as const;

const tracer = trace.getTracer("pulsar");
const log = getLogger("tuya.pulsar");

// Long-lived span covering the current websocket connection; lifecycle events
// (connected, reconnected, errors, log lines) are span events on it, so a
// reconnect storm reads as one timeline instead of many zero-length traces.
let connectionSpan: Span | undefined;

function startConnectionSpan(reconnect: boolean): void {
  connectionSpan?.end();
  connectionSpan = tracer.startSpan("pulsar.connection", {
    kind: SpanKind.CLIENT,
    attributes: {
      "messaging.system": "tuya-pulsar",
      "pulsar.reconnect": reconnect,
    },
  });
}

function recordEvent(name: string, attributes?: Record<string, string>): void {
  pulsarEvents.add(1, { event: name });
  connectionSpan?.addEvent(name, attributes);
}

function recordError(name: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  pulsarEvents.add(1, { event: name });
  logError(log, name, err);
  connectionSpan?.recordException(err);
  connectionSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
}

/** Starts the Tuya Pulsar (real-time push) connection once for the whole app lifetime. */
export function startTuyaPulsar(): void {
  const region =
    REGIONS[(process.env.TUYA_DATA_CENTER as keyof typeof REGIONS) ?? "us"];

  const client = new TuyaMessageSubscribeWebsocket({
    accessId: safeEnvGet("TUYA_ACCESS_ID"),
    accessKey: safeEnvGet("TUYA_ACCESS_SECRET"),
    url: region,
    env:
      process.env.TUYA_PULSAR_ENV === "test"
        ? TUYA_PASULAR_ENV.TEST
        : TUYA_PASULAR_ENV.PROD,
    maxRetryTimes: 100,
    logger: (level, ...args) => {
      const [, ...info] = args;
      if (level === "ERROR") recordError("pulsar.log", info[0]);
      else recordEvent("pulsar.log", { "log.message": info.map(String).join(" ") });
    },
  });

  client.open(() => {
    startConnectionSpan(false);
    recordEvent("pulsar.connected");
  });
  client.reconnect(() => {
    startConnectionSpan(true);
    recordEvent("pulsar.reconnected");
  });
  client.close(() => {
    recordEvent("pulsar.closed");
    connectionSpan?.end();
    connectionSpan = undefined;
  });

  client.message((_ws, raw) => {
    const message = raw as PulsarMessage;
    client.ackMessage(message.messageId);
    pulsarEvents.add(1, { event: "pulsar.message" });
    void handlePulsarMessage(message);
  });

  client.error((_ws, error) => recordError("pulsar.error", error));

  client.start();
}
