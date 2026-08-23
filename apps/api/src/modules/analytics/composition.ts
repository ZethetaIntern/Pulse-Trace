import { PrismaAnalyticsRepository } from './repositories/prisma-analytics-repository';
import { AnalyticsService } from './services/analytics-service';

/**
 * Shared application service for analytics. Stateless; the repository
 * is a singleton wrapping the shared Prisma client.
 */
export const analyticsService = new AnalyticsService(
  new PrismaAnalyticsRepository(),
);
