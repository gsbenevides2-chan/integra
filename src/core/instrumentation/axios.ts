import { AsyncLocalStorage } from "node:async_hooks";
import axios, { type AxiosError, type AxiosResponse } from "axios";
import { addTracerEvent } from "core/instrumentation";

/**
 * Tuya's SDK owns the request call, so a traceId can't be threaded through its config.
 * AsyncLocalStorage carries it across the await chain instead, scoped per call so
 * concurrent requests never see each other's traceId.
 */
const traceIdStorage = new AsyncLocalStorage<string>();

export function withTraceId<T>(traceId: string, fn: () => Promise<T>): Promise<T> {
    return traceIdStorage.run(traceId, fn);
}

export const instrumentableAxios = axios.create();

instrumentableAxios.interceptors.request.use((config) => {
    (config as { traceStart?: number }).traceStart = Date.now();
    return config;
});

async function traceResponse(response: AxiosResponse, isError: boolean): Promise<void> {
    const traceId = traceIdStorage.getStore();
    if (!traceId) return;

    const start = (response.config as { traceStart?: number }).traceStart;
    await addTracerEvent({
        traceId,
        eventName: "Instrumentable Axios",
        eventType: isError ? "ERROR" : "INFO",
        eventData: {
            durationMs: start ? Date.now() - start : null,
            request: {
                url: response.config.url,
                method: response.config.method,
                headers: response.config.headers,
                data: response.config.data,
            },
            response: { status: response.status, headers: response.headers, data: response.data },
        },
    });
}

instrumentableAxios.interceptors.response.use(
    async (response) => {
        await traceResponse(response, false);
        return response;
    },
    async (error: AxiosError) => {
        const traceId = traceIdStorage.getStore();
        if (traceId) {
            if (error.response) {
                await traceResponse(error.response, true);
            } else {
                const start = (error.config as { traceStart?: number } | undefined)?.traceStart;
                await addTracerEvent({
                    traceId,
                    eventName: "Instrumentable Axios",
                    eventType: "ERROR",
                    eventData: {
                        durationMs: start ? Date.now() - start : null,
                        request: { url: error.config?.url, method: error.config?.method },
                        error: { name: error.name, message: error.message },
                    },
                });
            }
        }
        throw error;
    },
);
