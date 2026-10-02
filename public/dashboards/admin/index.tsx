import React, { useCallback, useEffect, useState } from "react";

import { Button } from "@public/components/Button";
import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import { Bars3Icon, ServerStackIcon } from "@heroicons/react/24/outline";

import { getAdminEdenClient } from "./client";

interface CronJob {
  name: string;
  schedule: string;
}

interface CronListResponse {
  ok: boolean;
  jobs: CronJob[];
}

interface CronRunResponse {
  ok: boolean;
  job?: string;
  elapsed?: number;
  error?: string;
}

const REFRESH_INTERVAL_MS = 30000;

function formatScheduleLabel(schedule: string): string {
  // Maps common cron expressions to readable labels
  const labels: [string, string][] = [
    ["* * * * *", "Every minute"],
    ["*/1 * * * *", "Every minute"],
    ["*\\/1 * * * *", "Every minute"],
    ["*/2 * * * *", "Every 2 min"],
    ["*\\/2 * * * *", "Every 2 min"],
    ["*/5 * * * *", "Every 5 min"],
    ["*\\/5 * * * *", "Every 5 min"],
    ["*/10 * * * *", "Every 10 min"],
    ["*\\/10 * * * *", "Every 10 min"],
    ["*/30 * * * *", "Every 30 min"],
    ["*\\/30 * * * *", "Every 30 min"],
    ["0 * * * *", "Every hour"],
    ["0 */1 * * *", "Every hour"],
    ["0/2 * * * *", "Every 2 min"],
    ["0 4 * * *", "Daily @ 04:00"],
    ["0 9 * * *", "Daily @ 09:00"],
    ["0 12 * * *", "Daily @ 12:00"],
  ];
  for (const [pattern, label] of labels) {
    if (schedule === pattern) return label;
  }
  return schedule;
}

export function AdminDashboard() {
  const { showToast } = useToast();
  const globalDrawer = useGlobalDrawer();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());

  const fetchJobs = useCallback(
    async (useLoading: boolean) => {
      if (useLoading) setIsLoading(true);
      const client = getAdminEdenClient();
      const { data, error } = await client.api.admin.cron.list.get();
      if (error) {
        showToast("Falha ao buscar crons", "error");
      } else {
        const resp = data as unknown as CronListResponse | undefined;
        if (resp?.ok) {
          setJobs(resp.jobs ?? []);
        }
      }
      if (useLoading) setIsLoading(false);
    },
    [showToast],
  );

  useEffect(() => {
    fetchJobs(true);
    const interval = setInterval(
      () => fetchJobs(false),
      REFRESH_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const runJob = useCallback(
    async (jobName: string) => {
      const updated = new Set(runningJobs);
      updated.add(jobName);
      setRunningJobs(updated);

      const client = getAdminEdenClient();
      const { data, error } =
        await client.api.admin.cron.run({ jobName }).post();

      const afterRun = new Set(runningJobs);
      afterRun.delete(jobName);
      setRunningJobs(afterRun);

      if (error) {
        showToast(`Erro ao executar ${jobName}`, "error");
        return;
      }

      const resp = data as unknown as CronRunResponse | undefined;
      if (!resp?.ok) {
        showToast(
          resp?.error ?? `Falha ao executar ${jobName}`,
          "error",
        );
      } else {
        showToast(
          `${jobName} executado em ${resp.elapsed}ms`,
          "success",
        );
      }
    },
    [runningJobs, showToast],
  );

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-2">
        <IconButton
          onClick={() => globalDrawer.setIsOpen(true)}
          aria-label="Abrir menu"
        >
          <Bars3Icon className="size-5" />
        </IconButton>
        <h1 className="text-xl">Admin — Crons</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-mist-400">Carregando crons...</p>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <ServerStackIcon className="size-10 text-mist-500" />
          <p className="text-mist-200">Nenhum cron registrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md bg-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="
                border-b border-gray-700 text-left text-xs text-mist-400
              ">
                <th className="px-3 py-2 font-normal">Job</th>
                <th className="px-3 py-2 font-normal">Schedule</th>
                <th className="px-3 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.name}
                  className="border-b border-gray-700 last:border-0"
                >
                  <td className="px-3 py-2 font-mono text-mist-100">
                    {job.name}
                  </td>
                  <td className="px-3 py-2 text-mist-300">
                    <span className="text-xs">{job.schedule}</span>
                    <br />
                    <span className="text-mist-500 text-[10px]">
                      {formatScheduleLabel(job.schedule)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="secondary"
                      isLoading={runningJobs.has(job.name)}
                      disabled={runningJobs.has(job.name)}
                      onClick={() => runJob(job.name)}
                    >
                      Executar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const adminDashboard: DashboardData = {
  id: "admin",
  content: AdminDashboard,
  icon: ServerStackIcon,
  name: "Admin — Crons",
};