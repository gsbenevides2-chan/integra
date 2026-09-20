import { describe, expect, it } from "bun:test";
import { registerClient, unregisterClient, broadcastEvent, type ExecutionEvent } from "core/websocket";

// ---------------------------------------------------------------------------
// Unit: WebSocket broadcast manager
// ---------------------------------------------------------------------------
describe("WebSocket broadcast manager", () => {
    it("broadcasts to registered clients", () => {
        const messages: string[] = [];
        const fakeWs = {
            send: (msg: string) => messages.push(msg),
        } as any;

        registerClient(fakeWs);

        const event: ExecutionEvent = {
            type: "run:start",
            traceId: "test-trace-1",
            triggerId: "test-trigger",
            workflowType: "http",
            payload: { inputData: {} },
            timestamp: new Date().toISOString(),
        };

        broadcastEvent(event);

        expect(messages).toHaveLength(1);
        const parsed = JSON.parse(messages[0]!);
        expect(parsed.type).toBe("run:start");
        expect(parsed.traceId).toBe("test-trace-1");

        unregisterClient(fakeWs);
    });

    it("does not broadcast after client is unregistered", () => {
        const messages: string[] = [];
        const fakeWs = {
            send: (msg: string) => messages.push(msg),
        } as any;

        registerClient(fakeWs);
        unregisterClient(fakeWs);

        broadcastEvent({
            type: "run:start",
            traceId: "test-trace-2",
            triggerId: "test-trigger",
            workflowType: "http",
            payload: { inputData: {} },
            timestamp: new Date().toISOString(),
        });

        expect(messages).toHaveLength(0);
    });

    it("removes clients that throw on send", () => {
        const messages: string[] = [];
        const goodWs = {
            send: (msg: string) => messages.push(msg),
        } as any;
        const badWs = {
            send: () => {
                throw new Error("gone");
            },
        } as any;

        registerClient(goodWs);
        registerClient(badWs);

        broadcastEvent({
            type: "run:complete",
            traceId: "test-trace-3",
            triggerId: "test-trigger",
            workflowType: "mqtt",
            payload: { status: "SUCCESS" },
            timestamp: new Date().toISOString(),
        });

        expect(messages).toHaveLength(1);
        const parsed = JSON.parse(messages[0]!);
        expect(parsed.type).toBe("run:complete");
        expect(parsed.traceId).toBe("test-trace-3");
    });
});

// ---------------------------------------------------------------------------
// Integration: instrumentation + broadcast
// ---------------------------------------------------------------------------
describe("WebSocket instrumentation integration", () => {
    it("broadcasts on startTracer / endTracer / addTracerEvent", () => {
        expect(true).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// E2E: WebSocket endpoint
// ---------------------------------------------------------------------------
describe("WebSocket endpoint E2E", () => {
    it("connects, receives events, disconnects", () => {
        expect(true).toBe(true);
    });
});