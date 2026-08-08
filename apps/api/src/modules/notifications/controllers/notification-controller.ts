import { Request, Response } from 'express';
import { sendSuccess } from '../../../shared/utils/response';
import {
  toNotificationResponse,
  PaginatedNotificationsResponse,
} from '../dto/notification-response';
import { NotificationService } from '../services/notification-service';
import {
  validateCreateNotification,
  validateListNotificationsQuery,
  validateNotificationId,
} from '../validators/notification-validator';

/**
 * HTTP layer for notifications. Only parses requests, validates input, calls
 * the service and formats responses. No business logic or database access.
 */
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  async createNotification(req: Request, res: Response): Promise<void> {
    const dto = validateCreateNotification(req.body);
    const notification = await this.service.createNotification(dto);

    sendSuccess(res, toNotificationResponse(notification), 'Notification created successfully', 201);
  }

  async getNotification(req: Request, res: Response): Promise<void> {
    const notificationId = validateNotificationId(req.params.notificationId);
    const notification = await this.service.getNotificationById(notificationId);

    sendSuccess(res, toNotificationResponse(notification), 'Notification retrieved successfully');
  }

  async listNotifications(req: Request, res: Response): Promise<void> {
    const query = validateListNotificationsQuery(req.query);
    const { items, total } = await this.service.listNotifications(query);

    const data: PaginatedNotificationsResponse = {
      items: items.map(toNotificationResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };

    sendSuccess(res, data, 'Notifications retrieved successfully');
  }
}
