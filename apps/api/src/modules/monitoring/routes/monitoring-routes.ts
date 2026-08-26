import { Router } from 'express';
import { MonitoringController } from '../controllers/monitoring-controller';
import { monitoringService } from '../composition';

const router = Router();

const controller = new MonitoringController(monitoringService);

router.get('/health', controller.getHealth);
router.get('/queues', controller.getQueueMetrics);
router.get('/workers', controller.getWorkerMetrics);

export { router as monitoringRoutes };