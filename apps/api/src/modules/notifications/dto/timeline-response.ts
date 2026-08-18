import { NotificationEvent } from '@prisma/client';

/**
 * Response contract for GET /notifications/{notificationId}/timeline.
 * Matches the documented timeline shape in api-specification.md:
 * a flat, chronological array of { event, timestamp, metadata }.
 */
export interface TimelineEventResponse {
  event: string;
  timestamp: string;
  metadata: unknown;
}

export function toTimelineResponse(event: NotificationEvent): TimelineEventResponse {
  return {
    event: event.eventType,
    timestamp: event.occurredAt.toISOString(),
    metadata: event.metadata,
  };
}
