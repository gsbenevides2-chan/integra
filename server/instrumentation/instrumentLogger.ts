import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import type { Logger } from "@opentelemetry/api-logs";
import { Resource } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// ─── Global LoggerProvider setup ─────────────────────────────────────────

let initialized = false;

/**
 * Initialises the global OTel LoggerProvider with an OTLP exporter that
 * shares the pipeline's existing env configuration
 * (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`).
 *
 * Call **once** at process start, after the trace exporter is up.
 */
export function setupLoggerProvider(): void {
  if (initialized) return;
  initialized = true;

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: "integra",
  });

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor(new OTLPLogExporter()),
    ],
  });

  logs.setGlobalLoggerProvider(loggerProvider);
}

// ─── Convenience helpers ─────────────────────────────────────────────────

/**
 * Returns a named OTel Logger obtained from the global LoggerProvider.
 *
 * ```ts
 * const log = getLogger("tuya.pulsar");
 * log.emit({ severityNumber: SeverityNumber.ERROR, body: "…" });
 * ```
 */
export function getLogger(name: string): Logger {
  return logs.getLogger(name);
}

/** Shortcut for emitting a log record at `SeverityNumber.ERROR`. */
export function logError(
  logger: Logger,
  message: string,
  error?: unknown,
  extraAttributes?: Record<string, string>,
): void {
  const attrs: Record<string, string> = { ...extraAttributes };
  if (error instanceof Error) {
    attrs["error.type"] = error.name;
    attrs["error.message"] = error.message;
    if (error.stack) attrs["error.stack"] = error.stack;
  } else if (error !== undefined) {
    attrs["error.message"] = String(error);
  }

  logger.emit({
    severityNumber: SeverityNumber.ERROR,
    body: message,
    attributes: attrs,
  });
}

/**
 * Shortcut for emitting a log record at `SeverityNumber.INFO`.
 * Accepts optional structured attributes.
 */
export function logInfo(
  logger: Logger,
  message: string,
  extraAttributes?: Record<string, string>,
): void {
  logger.emit({
    severityNumber: SeverityNumber.INFO,
    body: message,
    attributes: extraAttributes,
  });
}

/**
 * Shortcut for emitting a log record at `SeverityNumber.WARN`.
 */
export function logWarn(
  logger: Logger,
  message: string,
  extraAttributes?: Record<string, string>,
): void {
  logger.emit({
    severityNumber: SeverityNumber.WARN,
    body: message,
    attributes: extraAttributes,
  });
}

export { SeverityNumber };