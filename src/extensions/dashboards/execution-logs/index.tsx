import { ArrowPathIcon, ClockIcon, TrashIcon } from "@heroicons/react/24/outline";
import type { DashboardData } from "core/ui/createDashboard";
import { Button } from "core/ui/components/button";
import { useConfirm } from "core/ui/components/confirm/context";
import { useToast } from "core/ui/components/toast";
import { getExecutionLogsEdenClient } from "extensions/scripts/execution-logs/client";
import type { RunDocument } from "extensions/scripts/execution-logs/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DotChart } from "./component/dotChart";
import { FilterBar, type FilterValues } from "./component/filterBar";
import { RunDetailModal } from "./component/runDetailModal";
import { RunsTable } from "./component/runsTable";
import { useExecutionWebSocket } from "./component/useExecutionWebSocket";

function Dashboard() {
    const [filters, setFilters] = useState<FilterValues>({
        startTimeGte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    const [runs, setRuns] = useState<RunDocument[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTraceId, setSelectedTraceId] = useState<string>();
    const [refreshKey, setRefreshKey] = useState(0);
    const [isClearing, setIsClearing] = useState(false);
    const { showToast } = useToast();
    const confirm = useConfirm();

    const { newRuns, completedRuns, status: wsStatus } = useExecutionWebSocket(
        useMemo(
            () => ({
                ...(filters.workflowType ? { workflowType: filters.workflowType } : {}),
                ...(filters.status ? { status: filters.status } : {}),
                ...(filters.triggerId ? { triggerId: filters.triggerId } : {}),
                ...(filters.startTimeGte ? { startTimeGte: filters.startTimeGte } : {}),
            }),
            [filters.workflowType, filters.status, filters.triggerId, filters.startTimeGte],
        ),
    );

    // Merge WebSocket events into the runs list
    useEffect(() => {
        if (newRuns.length === 0) return;
        setRuns((prev) => {
            const existingIds = new Set(prev.map((r) => r.traceId));
            const deduped = newRuns.filter((r) => !existingIds.has(r.traceId));
            if (deduped.length === 0) return prev;
            return [...deduped, ...prev];
        });
    }, [newRuns]);

    useEffect(() => {
        if (completedRuns.length === 0) return;
        setRuns((prev) => {
            let changed = false;
            const updated = prev.map((r) => {
                const match = completedRuns.find((c) => c.traceId === r.traceId);
                if (match) {
                    changed = true;
                    return { ...r, endTime: match.endTime, status: match.status };
                }
                return r;
            });
            return changed ? updated : prev;
        });
    }, [completedRuns]);

    // Disable WebSocket polling fallback when user explicitly toggles it
    const wsConnected = wsStatus === "connected";
    const wsPollingActive = wsStatus === "fallback-polling";
    const fetchRuns = useCallback(async () => {
        if (wsConnected) return; // WebSocket delivers real-time updates, no polling needed
        setIsLoading(true);
        const client = getExecutionLogsEdenClient();
        const { data, error } = await client["execution-logs"].runs.get({
            query: {
                ...(filters.workflowType ? { workflowType: filters.workflowType } : {}),
                ...(filters.status ? { status: filters.status } : {}),
                ...(filters.triggerId ? { triggerId: filters.triggerId } : {}),
                ...(filters.startTimeGte ? { startTimeGte: filters.startTimeGte } : {}),
                limit: "200",
            },
        });
        if (error) {
            showToast("Failed to fetch executions", "error");
        } else {
            setRuns((data?.runs as RunDocument[] | undefined) ?? []);
        }
        setIsLoading(false);
    }, [filters, showToast, wsConnected]);

    useEffect(() => {
        // On initial load, fetch runs from the API (the WebSocket only delivers new events)
        fetchRuns();
        // When WebSocket is connected, no polling needed — live events update the list
        // When WebSocket is not available, poll every 15s as fallback
        if (!wsConnected && !wsPollingActive) {
            const interval = setInterval(fetchRuns, 15000);
            return () => clearInterval(interval);
        }
    }, [fetchRuns, refreshKey, wsConnected, wsPollingActive]);

    const handleRefresh = useCallback(() => {
        setRefreshKey((key) => key + 1);
    }, []);

    const handleClearLogs = useCallback(async () => {
        const confirmed = await confirm({
            title: "Clear logs",
            message: "Are you sure you want to delete all execution logs? This cannot be undone.",
            confirmLabel: "Clear logs",
        });
        if (!confirmed) return;

        setIsClearing(true);
        const client = getExecutionLogsEdenClient();
        const { error } = await client["execution-logs"].runs.delete();
        setIsClearing(false);
        if (error) {
            showToast("Failed to clear logs", "error");
            return;
        }
        showToast("Logs cleared", "success");
        setSelectedTraceId(undefined);
        setRefreshKey((key) => key + 1);
    }, [confirm, showToast]);

    return (
        <div className="p-3 flex flex-col gap-4">
            <RunDetailModal
                isOpen={Boolean(selectedTraceId)}
                onClose={() => setSelectedTraceId(undefined)}
                traceId={selectedTraceId}
            />

            <div className="flex flex-wrap gap-3 justify-between items-center">
                <h1 className="text-xl">Execution History</h1>
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-mist-400">{runs.length} executions</span>
                    <span
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                            wsStatus === "connected"
                                ? "bg-green-900 text-green-300"
                                : wsStatus === "connecting"
                                  ? "bg-yellow-900 text-yellow-300"
                                  : wsStatus === "fallback-polling"
                                    ? "bg-orange-900 text-orange-300"
                                    : "bg-red-900 text-red-300"
                        }`}
                        title={
                            wsStatus === "connected"
                                ? "WebSocket conectado — tempo real"
                                : wsStatus === "connecting"
                                  ? "Conectando ao WebSocket..."
                                  : wsStatus === "fallback-polling"
                                    ? "Fallback para polling — WebSocket indisponível"
                                    : "Desconectado"
                        }
                    >
                        <span
                            className={`size-1.5 rounded-full ${
                                wsStatus === "connected"
                                    ? "bg-green-400"
                                    : wsStatus === "connecting"
                                      ? "bg-yellow-400"
                                      : wsStatus === "fallback-polling"
                                        ? "bg-orange-400"
                                        : "bg-red-400"
                            }`}
                        />
                        {wsStatus === "connected"
                            ? "Live"
                            : wsStatus === "connecting"
                              ? "Conectando"
                              : wsStatus === "fallback-polling"
                                ? "Polling"
                                : "Offline"}
                    </span>
                    <Button variant="secondary" isLoading={isLoading} onClick={handleRefresh}>
                        <ArrowPathIcon className="size-4" />
                        Refresh
                    </Button>
                    <Button variant="secondary" isLoading={isClearing} onClick={handleClearLogs}>
                        <TrashIcon className="size-4" />
                        Clear logs
                    </Button>
                </div>
            </div>

            <FilterBar onFilterChange={setFilters} />

            {isLoading && runs.length === 0 ? (
                <div className="h-90 flex items-center justify-center text-mist-400 text-sm">
                    Loading executions...
                </div>
            ) : runs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <ClockIcon className="size-10 text-mist-500" />
                    <p className="text-mist-200">No executions found</p>
                    <p className="text-sm text-mist-400">
                        Try widening the time range or clearing the filters.
                    </p>
                </div>
            ) : (
                <DotChart runs={runs} onSelectRun={setSelectedTraceId} />
            )}

            <div>
                <h2 className="text-lg mb-2">Runs</h2>
                <RunsTable key={refreshKey} filters={filters} onSelectRun={setSelectedTraceId} liveRuns={runs} />
            </div>
        </div>
    );
}

export const executionLogsDashboard: DashboardData = {
    id: "execution-logs",
    content: Dashboard,
    icon: ClockIcon,
    name: "Execution History",
};