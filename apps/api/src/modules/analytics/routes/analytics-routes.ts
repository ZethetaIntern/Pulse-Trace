import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/async-handler';
import { AnalyticsController } from '../controllers/analytics-controller';
import { analyticsService } from '../composition';

const router = Router();

const controller = new AnalyticsController(analyticsService);

router.get('/dashboard', asyncHandler((req, res) => controller.getDashboardMetrics(req, res)));
router.get('/trends', asyncHandler((req, res) => controller.getDeliveryTrends(req, res)));
router.get('/channels', asyncHandler((req, res) => controller.getChannelStatistics(req, res)));

export { router as analyticsRoutes };
