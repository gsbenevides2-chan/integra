import Elysia from "elysia";

import { jobRegistry } from "../../cron";

export const adminRoutes = new Elysia({
  prefix: "/api/admin",
  detail: { tags: ["Admin"] },
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