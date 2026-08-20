import type {
  ApiResponse,
  HealthResponse,
  ListNotificationsParams,
  NotificationResponse,
  PaginatedNotificationsResponse,
  ReplayExecutionResponse,
  ReplayNotificationResponse,
  TimelineEventResponse,
} from '../types';

const BASE_URL = '/api/v1';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const body: ApiResponse<T> | ApiErrorEnvelope = await res.json();

  if (!res.ok || !isSuccess(body)) {
    const msg = isApiError(body) ? body.error.code : 'UNKNOWN_ERROR';
    const details = isApiError(body) ? body.error.details : undefined;
    throw new ApiRequestError(msg, res.status, body.message, details);
  }

  return body.data;
}

function isSuccess(body: ApiResponse<unknown> | ApiErrorEnvelope): body is ApiResponse<unknown> {
  return body.success === true;
}

function isApiError(body: ApiResponse<unknown> | ApiErrorEnvelope): body is ApiErrorEnvelope {
  return body.success === false;
}

interface ApiErrorEnvelope {
  success: false;
  message: string;
  error: {
    code: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

// ============================================================
// Health
// ============================================================

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

// ============================================================
// Notifications
// ============================================================

export function listNotifications(
  params?: ListNotificationsParams,
): Promise<PaginatedNotificationsResponse> {
  const searchParams = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value));
      }
    }
  }
  const qs = searchParams.toString();
  return request<PaginatedNotificationsResponse>(`${BASE_URL}/notifications${qs ? `?${qs}` : ''}`);
}

export function getNotification(id: string): Promise<NotificationResponse> {
  return request<NotificationResponse>(`${BASE_URL}/notifications/${id}`);
}

// ============================================================
// Timeline
// ============================================================

export function getTimeline(id: string): Promise<TimelineEventResponse[]> {
  return request<TimelineEventResponse[]>(`${BASE_URL}/notifications/${id}/timeline`);
}

// ============================================================
// Replay
// ============================================================

export function replayNotification(
  id: string,
  reason?: string,
): Promise<ReplayNotificationResponse> {
  return request<ReplayNotificationResponse>(`${BASE_URL}/notifications/${id}/replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

export function getReplayHistory(id: string): Promise<ReplayExecutionResponse[]> {
  return request<ReplayExecutionResponse[]>(`${BASE_URL}/notifications/${id}/replays`);
}
