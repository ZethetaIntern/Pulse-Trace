// ============================================================
// API response envelope
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
  error: {
    code: string;
    details?: Array<{ field: string; message: string }>;
  };
}

// ============================================================
// Notification
// ============================================================

export type NotificationStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETRY_PENDING'
  | 'DLQ'
  | 'SKIPPED';

export type Channel = 'EMAIL' | 'SMS' | 'IN_APP';
export type Category = 'TRANSACTIONAL' | 'SECURITY' | 'SYSTEM' | 'INFORMATIONAL';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface NotificationResponse {
  id: string;
  userId: string;
  templateId: string;
  channel: Channel;
  category: Category;
  priority: Priority;
  status: NotificationStatus;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationResponse {
  notificationId: string;
  status: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedNotificationsResponse {
  items: NotificationResponse[];
  pagination: PaginationMeta;
}

// ============================================================
// Timeline
// ============================================================

export interface TimelineEventResponse {
  event: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ============================================================
// Replay
// ============================================================

export interface ReplayNotificationResponse {
  replayId: string;
  notificationId: string;
}

export interface ReplayExecutionResponse {
  replayId: string;
  originalNotificationId: string;
  newNotificationId: string | null;
  reason: string | null;
  triggeredBy: string | null;
  createdAt: string;
  newNotificationStatus?: string;
}

// ============================================================
// Health
// ============================================================

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
}

// ============================================================
// List query params
// ============================================================

export type SortField = 'createdAt' | 'status' | 'priority' | 'channel';
export type SortOrder = 'asc' | 'desc';

export interface ListNotificationsParams {
  page?: number;
  limit?: number;
  status?: NotificationStatus;
  channel?: Channel;
  category?: Category;
  priority?: Priority;
  userId?: string;
  sort?: SortField;
  order?: SortOrder;
}

// ============================================================
// Analytics
// ============================================================

export interface DashboardMetricsResponse {
  totalNotifications: number;
  successRate: number;
  failureRate: number;
  retryCount: number;
  dlqCount: number;
  channelBreakdown: Record<string, number>;
}

export interface TrendBucketResponse {
  date: string;
  created: number;
  delivered: number;
  failed: number;
  retried: number;
}

export interface DeliveryTrendsResponse {
  interval: string;
  from: string;
  to: string;
  buckets: TrendBucketResponse[];
}

export interface ChannelStatResponse {
  channel: string;
  total: number;
  delivered: number;
  failed: number;
  successRate: number;
}

export interface ChannelStatisticsResponse {
  channels: ChannelStatResponse[];
}

export type TrendInterval = 'hour' | 'day' | 'week' | 'month';

export interface TrendQueryParams {
  from?: string;
  to?: string;
  interval?: TrendInterval;
}
