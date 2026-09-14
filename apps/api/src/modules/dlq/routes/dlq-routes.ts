import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/async-handler';
import { PrismaDeadLetterRepository } from '../repositories/prisma-dead-letter-repository';
import { DlqController } from '../controllers/dlq-controller';

const router = Router();
const controller = new DlqController(new PrismaDeadLetterRepository());

router.get(
  '/:notificationId/dlq',
  asyncHandler((req, res) => controller.getDeadLetterByNotificationId(req, res)),
);

export { router as dlqRoutes };
