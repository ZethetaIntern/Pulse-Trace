import { monitoringRepository } from '../monitoring/composition';
import { ReadinessServiceImpl } from './services/readiness-service';
import { ReadinessService } from './interfaces/readiness-service';

export const readinessService: ReadinessService = new ReadinessServiceImpl(monitoringRepository);