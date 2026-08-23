import { NotificationEvent, EventType, NotificationStatus } from '@prisma/client';
import { toTimelineResponse } from '../../../../modules/notifications/dto/timeline-response';

function makeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    id: 'event-id-001',
    notificationId: 'notif-id-001',
    eventType: EventType.NOTIFICATION_CREATED,
    statusBefore: null,
    statusAfter: NotificationStatus.CREATED,
    executionId: null,
    metadata: { source: 'api' },
    occurredAt: new Date('2026-08-20T12:00:00.000Z'),
    ...overrides,
  } as NotificationEvent;
}

describe('toTimelineResponse', () => {
  it('maps event type to event field', () => {
    const event = makeEvent({ eventType: EventType.WORKER_STARTED });
    const result = toTimelineResponse(event);

    expect(result.event).toBe('WORKER_STARTED');
  });

  it('converts occurredAt to ISO string in timestamp field', () => {
    const event = makeEvent();
    const result = toTimelineResponse(event);

    expect(result.timestamp).toBe('2026-08-20T12:00:00.000Z');
    expect(typeof result.timestamp).toBe('string');
  });

  it('preserves metadata', () => {
    const event = makeEvent({
      metadata: { workerId: 'worker-1', attempt: 2 },
    });
    const result = toTimelineResponse(event);

    expect(result.metadata).toEqual({ workerId: 'worker-1', attempt: 2 });
  });

  it('handles null metadata', () => {
    const event = makeEvent({ metadata: {} });
    const result = toTimelineResponse(event);

    expect(result.metadata).toEqual({});
  });

  it('returns exactly 3 fields: event, timestamp, metadata', () => {
    const event = makeEvent();
    const result = toTimelineResponse(event);

    expect(Object.keys(result).sort()).toEqual(['event', 'metadata', 'timestamp']);
  });

  it('maps different event types correctly', () => {
    const eventTypes = [
      EventType.NOTIFICATION_CREATED,
      EventType.WORKER_COMPLETED,
      EventType.DELIVERY_FAILED,
      EventType.RETRY_SCHEDULED,
      EventType.REPLAY_REQUESTED,
    ];

    for (const eventType of eventTypes) {
      const event = makeEvent({ eventType });
      const result = toTimelineResponse(event);
      expect(result.event).toBe(eventType);
    }
  });
});
