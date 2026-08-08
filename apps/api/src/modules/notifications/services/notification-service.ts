import { Notification } from '@prisma/client';
import { logger } from '../../../infrastructure/logger';
import { HttpError } from '../../../shared/errors/http-error';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { ListNotificationsQuery } from '../dto/list-notifications-query';
import { NotificationRepository, PaginatedNotifications } from '../interfaces/notification-repository';

/**
 * Application/business logic for notifications.
 * Coordinates repository operations; performs no HTTP or database access itself.
 */
export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  async createNotification(dto: CreateNotificationDto): Promise<Notification> {
    const user = await this.repository.findUserById(dto.userId);
    if (!user) {
      throw new HttpError('User not found', 400, 'USER_NOT_FOUND', [
        { field: 'userId', message: 'no user exists with the given id' },
      ]);
    }

    const template = await this.repository.findTemplateById(dto.templateId);
    if (!template) {
      throw new HttpError('Template not found', 400, 'TEMPLATE_NOT_FOUND', [
        { field: 'templateId', message: 'no template exists with the given id' },
      ]);
    }

    if (template.channel !== dto.channel) {
      throw new HttpError('Template channel mismatch', 400, 'TEMPLATE_CHANNEL_MISMATCH', [
        {
          field: 'channel',
          message: `template is configured for ${template.channel}, but the request specifies ${dto.channel}`,
        },
      ]);
    }

    const notification = await this.repository.createNotification(dto);

    logger.info(
      { notificationId: notification.id, channel: notification.channel, category: notification.category },
      'Notification created',
    );

    return notification;
  }

  async getNotificationById(notificationId: string): Promise<Notification> {
    const notification = await this.repository.findNotificationById(notificationId);

    if (!notification) {
      throw new HttpError('Notification not found', 404, 'NOT_FOUND', [
        { field: 'notificationId', message: 'no notification exists with the given id' },
      ]);
    }

    return notification;
  }

  async listNotifications(query: ListNotificationsQuery): Promise<PaginatedNotifications> {
    const result = await this.repository.listNotifications(query);

    logger.info(
      { page: query.page, limit: query.limit, total: result.total },
      'Notifications listed',
    );

    return result;
  }
}
