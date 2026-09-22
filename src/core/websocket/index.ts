import type { ServerWebSocket } from "bun";

export interface ExecutionEvent {
    type: "run:start" | "run:complete" | "run:event";
    traceId: string;
    triggerId: string;
    workflowType: string;
    payload: Record<string, unknown>;
    timestamp: string;
}

const clients = new Set<ServerWebSocket<Record<string, never>>>();

export function registerClient(ws: ServerWebSocket<Record<string, never>>) {
    clients.add(ws);
}

export function unregisterClient(ws: ServerWebSocket<Record<string, never>>) {
    clients.delete(ws);
}

export function broadcastEvent(event: ExecutionEvent) {
    const message = JSON.stringify(event);
    for (const ws of clients) {
        try {
            ws.send(message);
        } catch {
            clients.delete(ws);
        }
    }
}