import { Category, Channel, NotificationStatus, Priority } from '@prisma/client';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { ListNotificationsQuery, NotificationSortField, SortOrder } from '../dto/list-notifications-query';
import { HttpError } from '../../../shared/errors/http-error';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SORT_FIELDS: NotificationSortField[] = ['createdAt', 'status', 'priority', 'channel'];
const SORT_ORDERS: SortOrder[] = ['asc', 'desc'];
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

interface ValidationDetail {
  field: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function readString(value: unknown, field: string, details: ValidationDetail[]): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    details.push({ field, message: 'must be a single string value' });
    return undefined;
  }
  return value;
}

function readEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  details: ValidationDetail[],
): T | undefined {
  const raw = readString(value, field, details);
  if (raw === undefined) {
    return undefined;
  }
  if (!(allowed as readonly string[]).includes(raw)) {
    details.push({ field, message: `must be one of: ${allowed.join(', ')}` });
    return undefined;
  }
  return raw as T;
}

/**
 * Like readEnum, but for required fields: a missing value produces a
 * "is required" validation detail instead of silently returning undefined.
 */
function readRequiredEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  details: ValidationDetail[],
): T | undefined {
  if (value === undefined || value === '') {
    details.push({ field, message: 'is required' });
    return undefined;
  }
  return readEnum(value, field, allowed, details);
}

function readPositiveInt(
  value: unknown,
  field: string,
  fallback: number,
  details: ValidationDetail[],
  max?: number,
): number {
  if (value === undefined || value === '') {
    return fallback;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    details.push({ field, message: 'must be a positive integer' });
    return fallback;
  }
  const parsed = parseInt(value, 10);
  if (parsed < 1 || (max !== undefined && parsed > max)) {
    details.push({
      field,
      message: max !== undefined ? `must be between 1 and ${max}` : 'must be at least 1',
    });
    return fallback;
  }
  return parsed;
}

function failValidation(details: ValidationDetail[]): never {
  throw new HttpError('Validation failed', 400, 'INVALID_REQUEST', details);
}

/**
 * Validates the POST /api/v1/notifications request body.
 */
export function validateCreateNotification(body: unknown): CreateNotificationDto {
  if (!isRecord(body)) {
    failValidation([{ field: 'body', message: 'request body must be a JSON object' }]);
  }

  const details: ValidationDetail[] = [];

  if (!isUuid(body.userId)) {
    details.push({ field: 'userId', message: 'must be a valid UUID' });
  }
  if (!isUuid(body.templateId)) {
    details.push({ field: 'templateId', message: 'must be a valid UUID' });
  }

  const channel = readRequiredEnum(body.channel, 'channel', Object.values(Channel), details);
  const category = readRequiredEnum(body.category, 'category', Object.values(Category), details);
  const priority = readEnum(body.priority, 'priority', Object.values(Priority), details);

  if (body.variables !== undefined && !isJsonRecord(body.variables)) {
    details.push({ field: 'variables', message: 'must be an object with JSON-serializable values' });
  }
  if (body.metadata !== undefined && !isRecord(body.metadata)) {
    details.push({ field: 'metadata', message: 'must be an object' });
  }

  if (details.length > 0) {
    failValidation(details);
  }

  return {
    userId: body.userId as string,
    templateId: body.templateId as string,
    channel: channel as Channel,
    category: category as Category,
    priority: priority ?? Priority.NORMAL,
    variables: body.variables as Record<string, unknown> | undefined,
    metadata: body.metadata as Record<string, unknown> | undefined,
  };
}

/**
 * Validates the :notificationId path parameter.
 */
export function validateNotificationId(raw: string): string {
  if (!isUuid(raw)) {
    failValidation([{ field: 'notificationId', message: 'must be a valid UUID' }]);
  }
  return raw;
}

/**
 * Validates the GET /api/v1/notifications query parameters.
 */
export function validateListNotificationsQuery(query: unknown): ListNotificationsQuery {
  const source = isRecord(query) ? query : {};
  const details: ValidationDetail[] = [];

  const page = readPositiveInt(source.page, 'page', 1, details);
  const limit = readPositiveInt(source.limit, 'limit', DEFAULT_LIMIT, details, MAX_LIMIT);

  const status = readEnum(source.status, 'status', Object.values(NotificationStatus), details);
  const channel = readEnum(source.channel, 'channel', Object.values(Channel), details);
  const category = readEnum(source.category, 'category', Object.values(Category), details);
  const priority = readEnum(source.priority, 'priority', Object.values(Priority), details);

  const rawUserId = readString(source.userId, 'userId', details);
  if (rawUserId !== undefined && !isUuid(rawUserId)) {
    details.push({ field: 'userId', message: 'must be a valid UUID' });
  }

  const rawSort = readString(source.sort, 'sort', details) ?? 'createdAt';
  if (!(SORT_FIELDS as string[]).includes(rawSort)) {
    details.push({ field: 'sort', message: `must be one of: ${SORT_FIELDS.join(', ')}` });
  }

  const rawOrder = readString(source.order, 'order', details) ?? 'desc';
  if (!(SORT_ORDERS as string[]).includes(rawOrder)) {
    details.push({ field: 'order', message: `must be one of: ${SORT_ORDERS.join(', ')}` });
  }

  if (details.length > 0) {
    failValidation(details);
  }

  return {
    page,
    limit,
    status,
    channel,
    category,
    priority,
    userId: rawUserId,
    sort: rawSort as NotificationSortField,
    order: rawOrder as SortOrder,
  };
}
