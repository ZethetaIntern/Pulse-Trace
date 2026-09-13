import { env } from '../../../config/env';

export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
  randomFn?: () => number;
}

export class BackoffCalculator {
  /**
   * Calculates backoff delay with exponential scaling, maximum cap, and configurable bounded jitter.
   *
   * @param nextAttemptNumber The 1-based attempt number being scheduled (e.g. 2 for 1st retry, 3 for 2nd retry).
   * @param options Configurable bounds and optional deterministic random generator.
   */
  static calculateDelay(nextAttemptNumber: number, options: BackoffOptions = {}): number {
    const baseDelayMs = options.baseDelayMs ?? env.retryBaseDelayMs;
    const maxDelayMs = options.maxDelayMs ?? env.retryMaxDelayMs;
    const jitterFactor = Math.max(0, Math.min(1, options.jitterFactor ?? env.retryJitterFactor));
    const randomFn = options.randomFn ?? Math.random;

    // Exponential scaling: for nextAttemptNumber = 2 (1st retry), multiplier is 2^0 = 1.
    const exponent = Math.max(0, nextAttemptNumber - 2);
    const exponentialDelay = baseDelayMs * Math.pow(2, exponent);

    // Apply maximum delay cap
    const cappedDelay = Math.min(maxDelayMs, exponentialDelay);

    // Apply bounded jitter:
    // Jittered = cappedDelay * (1 - J) + random(0, 1) * (cappedDelay * J)
    // When J = 1.0 (Full Jitter): delay is in [0, cappedDelay]
    // When J = 0.0 (No Jitter): delay is cappedDelay
    // When J = 0.2 (20% Jitter): delay is in [0.8 * cappedDelay, cappedDelay]
    const minBound = cappedDelay * (1 - jitterFactor);
    const jitterRange = cappedDelay * jitterFactor;
    const jitteredDelay = Math.floor(minBound + randomFn() * jitterRange);

    return Math.max(0, jitteredDelay);
  }

  /**
   * Returns deterministic unjittered capped delay for inspection / logging.
   */
  static getCappedBaseDelay(nextAttemptNumber: number, options: BackoffOptions = {}): number {
    const baseDelayMs = options.baseDelayMs ?? env.retryBaseDelayMs;
    const maxDelayMs = options.maxDelayMs ?? env.retryMaxDelayMs;
    const exponent = Math.max(0, nextAttemptNumber - 2);
    return Math.min(maxDelayMs, baseDelayMs * Math.pow(2, exponent));
  }
}
