import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/async-handler';
import { notificationService } from '../composition';
import { NotificationController } from '../controllers/notification-controller';

const router = Router();

const controller = new NotificationController(notificationService);

router.post('/', asyncHandler((req, res) => controller.createNotification(req, res)));
router.get('/', asyncHandler((req, res) => controller.listNotifications(req, res)));
router.get('/:notificationId', asyncHandler((req, res) => controller.getNotification(req, res)));

export { router as notificationRoutes };
