/**
 * Triggers that keep one run alive for their whole connection lifetime instead of one run
 * per invocation — `endTime` stays null by design, not because anything is stuck, and a
 * "duration" for them is meaningless.
 */
const CONTINUOUS_WORKFLOW_TYPES = new Set(["tuya-pulsar"]);

export function isContinuousWorkflow(workflowType: string): boolean {
    return CONTINUOUS_WORKFLOW_TYPES.has(workflowType);
}

export function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}min ${seconds}s`;
    }
    return `${minutes}min ${seconds}s`;
}

export function formatDateTime(date: Date): string {
    return date.toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
    });
}
