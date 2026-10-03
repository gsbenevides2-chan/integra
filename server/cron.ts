import { SpanKind, trace } from "@opentelemetry/api";

import { getLogger, logInfo } from "./instrumentation/instrumentLogger";
import { cronDuration, cronRuns } from "./instrumentation/metrics";
import { withSpan } from "./instrumentation/withSpan";
import { sendBirthdayMessage } from "./modules/birthday/jobs/sendMessage";
import { cleanAccessCodeEmails } from "./modules/google/jobs/accessCodeCleaner";
import {
  scheduleCalendarMessages,
  sendScheduledMessages,
} from "./modules/google/jobs/calendarReminders";
import { extractPayslips } from "./modules/google/jobs/payslipExtractor";
import { watchSupportTickets } from "./modules/google/jobs/supportTicketWatcher";
import {
  collectServerMetrics,
  collectSpeedtest,
} from "./modules/server-metrics/jobs/collect";
import { checkPlatformsStatus } from "./modules/status-platform/jobs/checkStatus";
import { syncTpLinkData } from "./modules/tplink/jobs/sync";
import { checkTrainLinesStatus } from "./modules/train-status/jobs/checkStatus";
import { HistoryService } from "./modules/tuya/service/history";

const tracer = trace.getTracer("cron");
const log = getLogger("cron");

/**
 * Guarantees every cron execution opens its own trace, regardless of whether the job
 * itself does any tracing — a single wrapping point instead of each job repeating the
 * try/catch/span boilerplate. A run's own error is recorded and swallowed here so one
 * failed execution (e.g. a flaky external dependency) doesn't take down the process.
 */
function tracedCronJob(name: string, fn: () => Promise<void>) {
  return async () => {
    const start = performance.now();
    let outcome = "success";
    await withSpan(
      tracer,
      `cron.${name}`,
      { kind: SpanKind.INTERNAL, attributes: { "cron.job.name": name } },
      async () => {
        try {
          await fn();
        } catch (error) {
          outcome = "error";
          throw error;
        }
      },
    )
      .catch(() => {}) // recorded on the span; don't take down the process
      .finally(() => {
        const attrs = { "cron.job.name": name, outcome };
        cronRuns.add(1, attrs);
        cronDuration.record(performance.now() - start, attrs);
      });
  };
}

export function registerCrons() {
  // Crons hit real hardware/APIs (routers, SSH boxes, Discord, Google, Tuya) — only
  // run them in production by default. Set ENABLE_CRONS=true to test one locally.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_CRONS !== "true"
  ) {
    logInfo(log, "Crons disabled in dev (set ENABLE_CRONS=true to enable).");
    return;
  }

  // Daily off-hours DB hygiene; device/sensor state itself arrives live via Tuya Pulsar.
  Bun.cron(
    "0 4 * * *",
    tracedCronJob("tuya.history.prune", () => HistoryService.pruneAll()),
  );
  Bun.cron(
    "*/10 * * * *",
    tracedCronJob("google.calendar.schedule", scheduleCalendarMessages),
  );
  Bun.cron(
    "* * * * *",
    tracedCronJob("google.calendar.send", sendScheduledMessages),
  );
  Bun.cron(
    "*/1 * * * *",
    tracedCronJob("google.gmail.support", watchSupportTickets),
  );
  Bun.cron(
    "0 * * * *",
    tracedCronJob("google.gmail.accesscode", cleanAccessCodeEmails),
  );
  Bun.cron(
    "0 12 * * *",
    tracedCronJob("google.gmail.payslip", extractPayslips),
  );
  Bun.cron(
    "*/2 * * * *",
    tracedCronJob("trainStatus.check", checkTrainLinesStatus),
  );
  Bun.cron(
    "*/5 * * * *",
    tracedCronJob("statusPlatform.check", checkPlatformsStatus),
  );
  Bun.cron(
    "*/2 * * * *",
    tracedCronJob("serverMetrics.collect", collectServerMetrics),
  );
  Bun.cron(
    "*/30 * * * *",
    tracedCronJob("serverMetrics.speedtest", collectSpeedtest),
  );
  Bun.cron("0/2 * * * *", tracedCronJob("tplink.sync", syncTpLinkData));
  Bun.cron("0 9 * * *", tracedCronJob("birthday.send", sendBirthdayMessage));
}
