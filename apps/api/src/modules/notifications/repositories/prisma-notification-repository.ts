import {
  Notification,
  NotificationStatus,
  Prisma,
  PrismaClient,
  Template,
  User,
} from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { ListNotificationsQuery } from '../dto/list-notifications-query';
import {
  NotificationRepository,
  PaginatedNotifications,
} from '../interfaces/notification-repository';

function orderByFor(query: ListNotificationsQuery): Prisma.NotificationOrderByWithRelationInput {
  return {
    createdAt: { createdAt: query.order },
    status: { status: query.order },
    priority: { priority: query.order },
    channel: { channel: query.order },
  }[query.sort];
}

/**
 * Prisma-backed repository. Contains all database access for notifications.
 * No business logic lives here.
 */
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async createNotification(dto: CreateNotificationDto): Promise<Notification> {
    return this.db.notification.create({
      data: {
        userId: dto.userId,
        templateId: dto.templateId,
        channel: dto.channel,
        category: dto.category,
        priority: dto.priority,
        payload: (dto.variables ?? {}) as Prisma.InputJsonValue,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async findNotificationById(id: string): Promise<Notification | null> {
    return this.db.notification.findUnique({ where: { id } });
  }

  async updateNotificationStatus(id: string, status: NotificationStatus): Promise<Notification | null> {
    return this.db.notification.update({
      where: { id },
      data: { status },
    });
  }

  async listNotifications(query: ListNotificationsQuery): Promise<PaginatedNotifications> {
    const where: Prisma.NotificationWhereInput = {
      ...(query.status !== undefined && { status: query.status }),
      ...(query.channel !== undefined && { channel: query.channel }),
      ...(query.category !== undefined && { category: query.category }),
      ...(query.priority !== undefined && { priority: query.priority }),
      ...(query.userId !== undefined && { userId: query.userId }),
    };

    const orderBy = orderByFor(query);

    const [items, total] = await this.db.$transaction([
      this.db.notification.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.notification.count({ where }),
    ]);

    return { items, total };
  }

  async findUserById(id: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  async findTemplateById(id: string): Promise<Template | null> {
    return this.db.template.findUnique({ where: { id } });
  }
}
