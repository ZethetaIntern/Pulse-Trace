import { BackoffCalculator } from '../../../../modules/retry/services/backoff-calculator';

describe('BackoffCalculator Unit Tests', () => {
  const baseOptions = {
    baseDelayMs: 1000,
    maxDelayMs: 300000,
  };

  describe('Deterministic exponential delay scaling', () => {
    it('should calculate exponential base delay correctly for attempts 2 to 5', () => {
      // 1st retry (attempt 2): 1000 * 2^0 = 1000ms
      expect(BackoffCalculator.getCappedBaseDelay(2, baseOptions)).toBe(1000);

      // 2nd retry (attempt 3): 1000 * 2^1 = 2000ms
      expect(BackoffCalculator.getCappedBaseDelay(3, baseOptions)).toBe(2000);

      // 3rd retry (attempt 4): 1000 * 2^2 = 4000ms
      expect(BackoffCalculator.getCappedBaseDelay(4, baseOptions)).toBe(4000);

      // 4th retry (attempt 5): 1000 * 2^3 = 8000ms
      expect(BackoffCalculator.getCappedBaseDelay(5, baseOptions)).toBe(8000);
    });

    it('should cap exponential delay at maxDelayMs', () => {
      const cappedOptions = {
        baseDelayMs: 1000,
        maxDelayMs: 5000,
      };

      // Attempt 4 would be 4000ms < 5000ms
      expect(BackoffCalculator.getCappedBaseDelay(4, cappedOptions)).toBe(4000);

      // Attempt 5 would be 8000ms -> capped to 5000ms
      expect(BackoffCalculator.getCappedBaseDelay(5, cappedOptions)).toBe(5000);

      // Attempt 10 would be 256000ms -> capped to 5000ms
      expect(BackoffCalculator.getCappedBaseDelay(10, cappedOptions)).toBe(5000);
    });
  });

  describe('Jitter factor behavior', () => {
    it('when jitterFactor = 0 (no jitter), delay should equal exact capped base delay', () => {
      const delay = BackoffCalculator.calculateDelay(3, {
        baseDelayMs: 1000,
        maxDelayMs: 300000,
        jitterFactor: 0.0,
      });

      expect(delay).toBe(2000);
    });

    it('when jitterFactor = 1.0 (full jitter), delay should be in [0, cappedDelay]', () => {
      // With random = 0.0 -> delay = 0
      const minDelay = BackoffCalculator.calculateDelay(3, {
        baseDelayMs: 1000,
        maxDelayMs: 300000,
        jitterFactor: 1.0,
        randomFn: () => 0.0,
      });
      expect(minDelay).toBe(0);

      // With random = 1.0 -> delay = 2000
      const maxDelay = BackoffCalculator.calculateDelay(3, {
        baseDelayMs: 1000,
        maxDelayMs: 300000,
        jitterFactor: 1.0,
        randomFn: () => 1.0,
      });
      expect(maxDelay).toBe(2000);

      // With random = 0.5 -> delay = 1000
      const midDelay = BackoffCalculator.calculateDelay(3, {
        baseDelayMs: 1000,
        maxDelayMs: 300000,
        jitterFactor: 1.0,
        randomFn: () => 0.5,
      });
      expect(midDelay).toBe(1000);
    });

    it('when jitterFactor = 0.2 (20% jitter), delay should remain in [0.8 * capped, capped]', () => {
      // capped = 4000ms
      // 0.8 * 4000 = 3200ms
      const minDelay = BackoffCalculator.calculateDelay(4, {
        baseDelayMs: 1000,
        maxDelayMs: 300000,
        jitterFactor: 0.2,
        randomFn: () => 0.0,
      });
      expect(minDelay).toBe(3200);

      const maxDelay = BackoffCalculator.calculateDelay(4, {
        baseDelayMs: 1000,
        maxDelayMs: 300000,
        jitterFactor: 0.2,
        randomFn: () => 1.0,
      });
      expect(maxDelay).toBe(4000);
    });
  });
});
