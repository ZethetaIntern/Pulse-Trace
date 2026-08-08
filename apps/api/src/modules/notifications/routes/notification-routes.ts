import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/async-handler';
import { NotificationController } from '../controllers/notification-controller';
import { PrismaNotificationRepository } from '../repositories/prisma-notification-repository';
import { NotificationService } from '../services/notification-service';

const router = Router();

const controller = new NotificationController(new NotificationService(new PrismaNotificationRepository()));

router.post('/', asyncHandler((req, res) => controller.createNotification(req, res)));
router.get('/', asyncHandler((req, res) => controller.listNotifications(req, res)));
router.get('/:notificationId', asyncHandler((req, res) => controller.getNotification(req, res)));

export { router as notificationRoutes };
