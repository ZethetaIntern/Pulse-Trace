import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/async-handler';
import { ReplayController } from '../controllers/replay-controller';
import { replayService } from '../composition';

const router = Router();

const controller = new ReplayController(replayService);

router.post(
  '/:notificationId/replay',
  asyncHandler((req, res) => controller.replayNotification(req, res)),
);
router.get(
  '/:notificationId/replays',
  asyncHandler((req, res) => controller.getReplayHistory(req, res)),
);

export { router as replayRoutes };
