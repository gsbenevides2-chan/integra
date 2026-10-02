import Elysia from "elysia";

import { jobRegistry } from "../../cron";

const adminKey = process.env.ADMIN_KEY;

/**
 * Admin routes for manual cron execution and listing.
 *
 * Protected by X-Admin-Key header matching ADMIN_KEY env var. When ADMIN_KEY is
 * unset (local dev) the routes are accessible without auth — in production you
 * MUST set ADMIN_KEY to a strong random value.
 */
export const adminRoutes = new Elysia({
  prefix: "/api/admin",
  detail: { tags: ["Admin"] },
})
  // Auth guard
  .onBeforeHandle(({ request }) => {
    if (adminKey) {
      const headerKey = request.headers.get("x-admin-key");
      if (headerKey !== adminKey) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
    }
  })
  .get(
    "/cron/list",
    () => {
      const jobs = Array.from(jobRegistry.entries()).map(([name, info]) => ({
        name,
        schedule: info.schedule,
      }));
      return { ok: true, jobs };
    },
    {
      detail: {
        summary: "List crons",
        description: "Lists all registered cron jobs with their schedules.",
      },
    },
  )
  .post(
    "/cron/run/:jobName",
    async ({ params }) => {
      const job = jobRegistry.get(params.jobName);
      if (!job) {
        return new Response(
          JSON.stringify({ ok: false, error: `Job '${params.jobName}' not found` }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        );
      }

      const start = Date.now();
      await job.fn();
      const elapsed = Date.now() - start;

      return { ok: true, job: params.jobName, elapsed };
    },
    {
      detail: {
        summary: "Run cron",
        description: "Executes a registered cron job immediately and returns the elapsed time.",
      },
    },
  );