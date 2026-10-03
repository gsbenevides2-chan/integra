import {
  type Attributes,
  type Span,
  SpanKind,
  SpanStatusCode,
  type Tracer,
} from "@opentelemetry/api";

/**
 * Runs `fn` inside an active span. On failure records the exception, `error.type`
 * and ERROR status, then rethrows; on success the status is left UNSET (semconv).
 * The span is always ended.
 */
export function withSpan<T>(
  tracer: Tracer,
  name: string,
  options: { kind?: SpanKind; attributes?: Attributes },
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    { kind: SpanKind.INTERNAL, ...options },
    async (span) => {
      try {
        return await fn(span);
      } catch (error) {
        recordSpanError(span, error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export function recordSpanError(span: Span, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  span.recordException(err);
  span.setAttribute("error.type", err.name);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
}
