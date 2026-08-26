import { Router } from 'express';
import { ReadinessController } from '../controllers/readiness-controller';
import { readinessService } from '../composition';

const router = Router();

const controller = new ReadinessController(readinessService);

router.get('/ready', controller.getReadiness);

export { router as readinessRoutes };