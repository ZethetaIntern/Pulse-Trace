import {
  EventType,
  Notification,
  NotificationStatus,
  OutboxStatus,
  Prisma,
  PrismaClient,
  Template,
  User,
} from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { ListNotificationsQuery } from '../dto/list-notifications-query';
import {
  CreateNotificationTransactionalInput,
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

  /**
   * Atomically creates a Notification, its initial NotificationEvents, and
   * its corresponding OutboxEvent in a single PostgreSQL ACID transaction.
   */
  async createNotificationTransactional(input: CreateNotificationTransactionalInput): Promise<Notification> {
    return this.db.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          userId: input.dto.userId,
          templateId: input.dto.templateId,
          channel: input.dto.channel,
          category: input.dto.category,
          priority: input.dto.priority,
          status: input.initialStatus ?? NotificationStatus.QUEUED,
          payload: (input.dto.variables ?? {}) as Prisma.InputJsonValue,
          metadata: (input.dto.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      if (input.events && input.events.length > 0) {
        for (const evt of input.events) {
          await tx.notificationEvent.create({
            data: {
              notificationId: notification.id,
              eventType: evt.eventType,
              statusBefore: evt.statusBefore,
              statusAfter: evt.statusAfter,
              metadata: evt.metadata ?? {},
            },
          });
        }
      }

      if (input.replayExecution) {
        await tx.replayExecution.create({
          data: {
            originalNotificationId: input.replayExecution.originalNotificationId,
            newNotificationId: notification.id,
            reason: input.replayExecution.reason,
            triggeredBy: input.replayExecution.triggeredBy,
            status: 'REQUESTED',
          },
        });
      }

      if (input.outbox) {
        // Ensure the payload references the actual persisted notificationId
        const payloadWithId = {
          ...input.outbox.payload,
          notificationId: notification.id,
        };

        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Notification',
            aggregateId: notification.id,
            eventType: EventType.NOTIFICATION_CREATED,
            topic: input.outbox.topic,
            partitionKey: input.outbox.partitionKey,
            payload: payloadWithId as Prisma.InputJsonValue,
            status: OutboxStatus.PENDING,
          },
        });
      }

      return notification;
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
