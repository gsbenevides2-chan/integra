import React, { useCallback, useEffect, useState } from "react";

import { Button } from "@public/components/Button";
import {
  DashboardData,
  useGlobalDrawer,
} from "@public/components/GlobalDrawerContext";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";

import {
  Bars3Icon,
  PlayIcon,
  ServerStackIcon,
} from "@heroicons/react/24/outline";

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
  const labels: [string, string][] = [
    ["* * * * *", "A cada minuto"],
    ["*/1 * * * *", "A cada minuto"],
    ["*/2 * * * *", "A cada 2 min"],
    ["*/5 * * * *", "A cada 5 min"],
    ["*/10 * * * *", "A cada 10 min"],
    ["*/30 * * * *", "A cada 30 min"],
    ["0 * * * *", "A cada hora"],
    ["0/2 * * * *", "A cada 2 min"],
    ["0 4 * * *", "Diário 04:00"],
    ["0 9 * * *", "Diário 09:00"],
    ["0 12 * * *", "Diário 12:00"],
  ];
  for (const [pattern, label] of labels) {
    if (schedule === pattern) return label;
  }
  return schedule;
}

const JOB_LABELS: Record<string, string> = {
  "tuya.history.prune": "Podar histórico Tuya",
  "google.calendar.schedule": "Agendar lembretes Google Calendar",
  "google.calendar.send": "Enviar lembretes agendados",
  "google.gmail.support": "Verificar tickets de suporte",
  "google.gmail.accesscode": "Limpar e-mails de código de acesso",
  "google.gmail.payslip": "Extrair holerites",
  "trainStatus.check": "Verificar status de trens",
  "statusPlatform.check": "Verificar status de plataformas",
  "serverMetrics.collect": "Coletar métricas do servidor",
  "serverMetrics.speedtest": "Teste de velocidade",
  "tplink.sync": "Sincronizar TP-Link",
  "birthday.send": "Enviar mensagem de aniversário",
};

function getJobLabel(name: string): string {
  return JOB_LABELS[name] ?? name;
}

export function AdminDashboard() {
  const { showToast } = useToast();
  const globalDrawer = useGlobalDrawer();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<
    Record<string, { elapsed: number } | { error: string }>
  >({});

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
    const interval = setInterval(() => fetchJobs(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const runJob = useCallback(
    async (jobName: string) => {
      const updated = new Set(runningJobs);
      updated.add(jobName);
      setRunningJobs(updated);

      const client = getAdminEdenClient();
      const { data, error } = await client.api.admin.cron.run({ jobName }).post();

      const afterRun = new Set(runningJobs);
      afterRun.delete(jobName);
      setRunningJobs(afterRun);

      if (error) {
        setLastResult((prev) => ({
          ...prev,
          [jobName]: { error: error.message || "Erro desconhecido" },
        }));
        showToast(`Falha ao executar ${getJobLabel(jobName)}`, "error");
        return;
      }

      const resp = data as unknown as CronRunResponse | undefined;
      if (!resp?.ok) {
        setLastResult((prev) => ({
          ...prev,
          [jobName]: { error: resp?.error ?? "Erro desconhecido" },
        }));
        showToast(resp?.error ?? `Falha ao executar ${getJobLabel(jobName)}`, "error");
      } else {
        setLastResult((prev) => ({
          ...prev,
          [jobName]: { elapsed: resp.elapsed! },
        }));
        showToast(`${getJobLabel(jobName)} concluído em ${resp.elapsed}ms`, "success");
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
                <th className="px-3 py-2 font-normal">Última execução</th>
                <th className="px-3 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.name}
                  className="border-b border-gray-700 last:border-0 hover:bg-gray-700/40"
                >
                  <td className="px-3 py-2">
                    <span className="text-mist-100">{getJobLabel(job.name)}</span>
                    <br />
                    <span className="text-[10px] text-mist-400">{job.name}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-mist-300">{formatScheduleLabel(job.schedule)}</span>
                    <br />
                    <span className="text-[10px] text-mist-500">{job.schedule}</span>
                  </td>
                  <td className="px-3 py-2">
                    {runningJobs.has(job.name) ? (
                      <span className="text-yellow-300 text-xs">Executando...</span>
                    ) : job.name in lastResult ? (
                      "elapsed" in lastResult[job.name]
                        ? (
                          <span className="text-green-300 text-xs">
                            OK — {(lastResult[job.name] as { elapsed: number }).elapsed}ms
                          </span>
                        ) : (
                          <span className="text-red-300 text-xs">
                            Erro
                          </span>
                        )
                    ) : (
                      <span className="text-mist-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="secondary"
                      isLoading={runningJobs.has(job.name)}
                      disabled={runningJobs.has(job.name)}
                      onClick={() => runJob(job.name)}
                    >
                      <PlayIcon className="size-4" /> Executar
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