import type { RunDocument } from "extensions/scripts/execution-logs/types";
import { getExecutionLogsEdenClient } from "extensions/scripts/execution-logs/client";
import { useCallback, useEffect, useRef, useState } from "react";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "fallback-polling";

interface ExecutionEvent {
    type: "run:start" | "run:complete" | "run:event" | "connected";
    traceId: string;
    triggerId: string;
    workflowType: string;
    payload: Record<string, unknown>;
    timestamp: string;
}

interface UseWebSocketEventsResult {
    newRuns: RunDocument[];
    updatedRuns: RunDocument[];
    completedRuns: RunDocument[];
    status: ConnectionStatus;
}

/**
 * Calculates the WebSocket URL from the current page origin, falling back to
 * window.location if the base URL can't be determined at build time.
 */
function getWebSocketUrl(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/events`;
}

const POLL_INTERVAL_MS = 5000;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

export function useExecutionWebSocket(filters: {
    workflowType?: string;
    status?: string;
    triggerId?: string;
    startTimeGte?: string;
}): UseWebSocketEventsResult {
    const [newRuns, setNewRuns] = useState<RunDocument[]>([]);
    const [updatedRuns, setUpdatedRuns] = useState<RunDocument[]>([]);
    const [completedRuns, setCompletedRuns] = useState<RunDocument[]>([]);
    const [status, setStatus] = useState<ConnectionStatus>("connecting");
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fallbackRef = useRef(false);
    const mountedRef = useRef(true);
    const filtersRef = useRef(filters);
    filtersRef.current = filters;

    // ---- Polling fallback ----
    const startPolling = useCallback(() => {
        setStatus("fallback-polling");
        fallbackRef.current = true;

        const poll = async () => {
            if (!mountedRef.current) return;
            const client = getExecutionLogsEdenClient();
            const f = filtersRef.current;
            const { data, error } = await client["execution-logs"].runs.get({
                query: {
                    ...(f.workflowType ? { workflowType: f.workflowType } : {}),
                    ...(f.status ? { status: f.status } : {}),
                    ...(f.triggerId ? { triggerId: f.triggerId } : {}),
                    ...(f.startTimeGte ? { startTimeGte: f.startTimeGte } : {}),
                    limit: "50",
                    sortField: "startTime",
                    sortOrder: "desc",
                },
            });
            if (!error && data?.runs) {
                const runs = data.runs as RunDocument[];
                const recent = runs.filter(
                    (r) => new Date(r.startTime).getTime() > Date.now() - 30000,
                );
                if (recent.length > 0) {
                    setNewRuns((prev) => {
                        const existing = new Set(prev.map((r) => r.traceId));
                        const deduped = recent.filter((r) => !existing.has(r.traceId));
                        return deduped.length > 0 ? [...deduped, ...prev] : prev;
                    });
                }
            }
        };

        pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
        poll();
    }, []);

    const stopPolling = useCallback(() => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
        fallbackRef.current = false;
    }, []);

    // ---- WebSocket connection ----
    const connect = useCallback(() => {
        if (!mountedRef.current) return;
        if (fallbackRef.current) return;

        // Feature detection — if WebSocket is not supported, fall back immediately
        if (typeof WebSocket === "undefined") {
            startPolling();
            return;
        }

        setStatus("connecting");

        try {
            const ws = new WebSocket(getWebSocketUrl());
            wsRef.current = ws;

            ws.onopen = () => {
                if (!mountedRef.current) {
                    ws.close();
                    return;
                }
                setStatus("connected");
                reconnectAttemptRef.current = 0;
                stopPolling();
            };

            ws.onmessage = (event) => {
                if (!mountedRef.current) return;
                try {
                    const msg: ExecutionEvent = JSON.parse(event.data);
                    if (msg.type === "connected") return;

                    const run: RunDocument = {
                        traceId: msg.traceId,
                        triggerId: msg.triggerId,
                        workflowType: msg.workflowType,
                        startTime: msg.timestamp,
                        status: "RUNNING",
                        inputData: {},
                        events: [],
                    };

                    if (msg.type === "run:start") {
                        setNewRuns((prev) => [run, ...prev]);
                    } else if (msg.type === "run:complete") {
                        setCompletedRuns((prev) => [
                            ...prev,
                            {
                                ...run,
                                status: (msg.payload.status as string) ?? "COMPLETED",
                                endTime: msg.timestamp,
                            },
                        ]);
                    } else if (msg.type === "run:event") {
                        setUpdatedRuns((prev) => [...prev, run]);
                    }
                } catch {
                    // ignore malformed messages
                }
            };

            ws.onclose = () => {
                if (!mountedRef.current) return;
                wsRef.current = null;
                if (fallbackRef.current) return;

                setStatus("disconnected");
                reconnectAttemptRef.current += 1;

                if (reconnectAttemptRef.current >= 3) {
                    startPolling();
                    return;
                }

                const delay = Math.min(
                    RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttemptRef.current - 1),
                    RECONNECT_MAX_DELAY_MS,
                );
                reconnectTimerRef.current = setTimeout(connect, delay);
            };

            ws.onerror = () => {
                // onclose will fire after onerror, triggering reconnection logic
                ws.close();
            };
        } catch {
            // WebSocket constructor threw — fall back to polling
            startPolling();
        }
    }, [startPolling, stopPolling]);

    // ---- Lifecycle ----
    useEffect(() => {
        connect();

        return () => {
            mountedRef.current = false;
            if (wsRef.current) {
                wsRef.current.onclose = null; // prevent reconnect loop
                wsRef.current.close();
                wsRef.current = null;
            }
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            stopPolling();
        };
    }, [connect, stopPolling]);

    return { newRuns, updatedRuns, completedRuns, status };
}