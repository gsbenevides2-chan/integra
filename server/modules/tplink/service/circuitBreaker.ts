import { getLogger, logWarn } from "../../../instrumentation/instrumentLogger";
import { meter } from "../../../instrumentation/metrics";

/**
 * Circuit breaker pattern to prevent overwhelming the TP-Link router during frequent errors.
 * Uses exponential backoff and automatic recovery after cooldown period.
 *
 * ponytail: per-process in-memory state (Map), not shared across instances — fine as long
 * as this runs as a single process. Upgrade to server/shared/cache.ts (Redis) if it ever
 * needs to run as more than one instance.
 */

const errorStates = new Map<
  string,
  {
    lastErrorTime: number;
    errorCount: number;
    isOpen: boolean;
  }
>();

const CONFIG = {
  ERROR_COOLDOWN_MS: 60 * 1000, // 1 minute cooldown after error
  ERROR_THRESHOLD: 3, // number of errors before opening circuit
};

const log = getLogger("tplink.circuit_breaker");

meter
  .createObservableGauge("tplink.circuit_breaker.open", {
    description: "Number of TP-Link circuit breakers currently open.",
  })
  .addCallback((result) => {
    result.observe([...errorStates.values()].filter((s) => s.isOpen).length);
  });

export interface CircuitBreakerState {
  isOpen: boolean;
  nextRetryAt?: Date;
  errorCount: number;
}

export function getCircuitBreakerState(triggerId: string): CircuitBreakerState {
  const state = errorStates.get(triggerId);

  if (!state) {
    return { isOpen: false, errorCount: 0 };
  }

  const timeSinceLastError = Date.now() - state.lastErrorTime;
  const isRecovered = timeSinceLastError > CONFIG.ERROR_COOLDOWN_MS;

  if (isRecovered) {
    errorStates.delete(triggerId);
    return { isOpen: false, errorCount: 0 };
  }

  const nextRetryAt = new Date(state.lastErrorTime + CONFIG.ERROR_COOLDOWN_MS);

  return { isOpen: state.isOpen, nextRetryAt, errorCount: state.errorCount };
}

export function shouldThrottle(triggerId: string): boolean {
  return getCircuitBreakerState(triggerId).isOpen;
}

export function recordError(triggerId: string, error: unknown): void {
  const existingState = errorStates.get(triggerId);

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCount = (existingState?.errorCount ?? 0) + 1;
  const isOpen = errorCount >= CONFIG.ERROR_THRESHOLD;

  errorStates.set(triggerId, { lastErrorTime: Date.now(), errorCount, isOpen });

  if (isOpen) {
    const cooldownSec = CONFIG.ERROR_COOLDOWN_MS / 1000;
    logWarn(log, "Circuit breaker OPEN", {
      trigger: triggerId,
      error_count: errorCount,
      cooldown_s: cooldownSec,
      "error.message": errorMessage,
    });
  } else {
    logWarn(log, "Circuit breaker error recorded", {
      trigger: triggerId,
      error_count: errorCount,
      threshold: CONFIG.ERROR_THRESHOLD,
      "error.message": errorMessage,
    });
  }
}

export function recordSuccess(triggerId: string): void {
  errorStates.delete(triggerId);
}

export function reset(triggerId?: string): void {
  if (triggerId) {
    errorStates.delete(triggerId);
  } else {
    errorStates.clear();
  }
}
