import { ReplayExecution, NotificationStatus } from '@prisma/client';
import { toReplayExecutionResponse } from '../../../../modules/replay/dto/replay-response';

function makeReplayExecution(overrides: Partial<ReplayExecution> = {}): ReplayExecution {
  return {
    id: 'replay-id-001',
    originalNotificationId: 'original-notif-id',
    newNotificationId: 'new-notif-id',
    reason: 'Provider recovered',
    triggeredBy: 'api',
    createdAt: new Date('2026-08-20T12:05:00.000Z'),
    ...overrides,
  } as ReplayExecution;
}

describe('toReplayExecutionResponse', () => {
  it('maps all fields correctly', () => {
    const execution = makeReplayExecution();
    const result = toReplayExecutionResponse(execution);

    expect(result.replayId).toBe('replay-id-001');
    expect(result.originalNotificationId).toBe('original-notif-id');
    expect(result.newNotificationId).toBe('new-notif-id');
    expect(result.reason).toBe('Provider recovered');
    expect(result.triggeredBy).toBe('api');
    expect(result.createdAt).toBe('2026-08-20T12:05:00.000Z');
  });

  it('includes newNotificationStatus when provided', () => {
    const execution = makeReplayExecution();
    const result = toReplayExecutionResponse(execution, NotificationStatus.DELIVERED);

    expect(result.newNotificationStatus).toBe(NotificationStatus.DELIVERED);
  });

  it('omits newNotificationStatus when not provided', () => {
    const execution = makeReplayExecution();
    const result = toReplayExecutionResponse(execution);

    expect(result.newNotificationStatus).toBeUndefined();
  });

  it('handles null newNotificationId', () => {
    const execution = makeReplayExecution({ newNotificationId: null });
    const result = toReplayExecutionResponse(execution);

    expect(result.newNotificationId).toBeNull();
  });

  it('handles null reason', () => {
    const execution = makeReplayExecution({ reason: null });
    const result = toReplayExecutionResponse(execution);

    expect(result.reason).toBeNull();
  });

  it('handles null triggeredBy', () => {
    const execution = makeReplayExecution({ triggeredBy: null });
    const result = toReplayExecutionResponse(execution);

    expect(result.triggeredBy).toBeNull();
  });

  it('converts Date to ISO string', () => {
    const execution = makeReplayExecution();
    const result = toReplayExecutionResponse(execution);

    expect(typeof result.createdAt).toBe('string');
    expect(result.createdAt).toBe('2026-08-20T12:05:00.000Z');
  });

  it('does not lose any required fields', () => {
    const execution = makeReplayExecution();
    const result = toReplayExecutionResponse(execution);

    const expectedKeys = [
      'replayId', 'originalNotificationId', 'newNotificationId',
      'reason', 'triggeredBy', 'createdAt',
    ];
    expect(Object.keys(result).sort()).toEqual(expectedKeys.sort());
  });
});
