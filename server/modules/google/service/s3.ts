import { SpanKind, trace } from "@opentelemetry/api";

import { withSpan } from "../../../instrumentation/withSpan";

const tracer = trace.getTracer("google");

function traced<T>(
  name: string,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withSpan(
    tracer,
    name,
    {
      kind: SpanKind.CLIENT,
      attributes: { "s3.bucket": process.env.S3_BUCKET ?? "", "s3.key": key },
    },
    fn,
  );
}

export function uploadTemp(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<number> {
  return traced("s3.upload", key, () =>
    Bun.s3.write(key, data, { type: contentType }),
  );
}

// Synchronous, local URL signing — no network call, so no span for it.
export function presignedUrl(key: string, expiresIn = 3600): string {
  return Bun.s3.presign(key, { expiresIn });
}

export function deleteTemp(key: string): Promise<void> {
  return traced("s3.delete", key, () => Bun.s3.delete(key));
}
