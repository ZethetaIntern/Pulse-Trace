import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import {
  AnalyticsRepository,
  ChannelStat,
  DashboardMetrics,
  TrendBucket,
  TrendQuery,
} from '../interfaces/analytics-repository';

// Maps the Prisma interval name to the PostgreSQL date_trunc argument.
const INTERVAL_MAP: Record<TrendQuery['interval'], string> = {
  hour: 'hour',
  day: 'day',
  week: 'week',
  month: 'month',
};

/**
 * Prisma-backed analytics repository.
 * Uses PostgreSQL-side aggregation ($queryRaw for date_trunc, Prisma
 * groupBy/count for simple aggregations) to avoid pulling entire tables
 * into Node.
 */
export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const [
      totalNotifications,
      deliveredCount,
      failedCount,
      dlqCount,
      channelRows,
      retryCount,
    ] = await Promise.all([
      this.db.notification.count(),
      this.db.notification.count({ where: { status: 'DELIVERED' } }),
      this.db.notification.count({ where: { status: 'FAILED' } }),
      this.db.notification.count({ where: { status: 'DLQ' } }),
      this.db.notification.groupBy({
        by: ['channel'],
        _count: { id: true },
      }),
      this.db.notificationEvent.count({
        where: { eventType: 'RETRY_SCHEDULED' },
      }),
    ]);

    const channelBreakdown: Record<string, number> = {};
    for (const row of channelRows) {
      channelBreakdown[row.channel] = row._count.id;
    }

    return {
      totalNotifications,
      deliveredCount,
      failedCount,
      dlqCount,
      retryCount,
      channelBreakdown,
    };
  }

  async getDeliveryTrends(query: TrendQuery): Promise<TrendBucket[]> {
    const trunc = INTERVAL_MAP[query.interval];

    // The trunc value comes from INTERVAL_MAP which only contains
    // whitelisted values (hour/day/week/month), so direct interpolation
    // into the SQL string is safe. Using raw string construction avoids
    // Prisma parameterization issues where CAST($1 AS text) causes
    // PostgreSQL to see different expressions in SELECT vs GROUP BY.
    // Dates are passed as Prisma parameters for type safety.
    const [notificationBuckets, retryBuckets] = await Promise.all([
      this.db.$queryRaw<
        Array<{ bucket: Date; created: bigint; delivered: bigint; failed: bigint }>
      >`
        SELECT
          date_trunc(${trunc}, n."createdAt") AS bucket,
          COUNT(*)::bigint AS created,
          COUNT(*) FILTER (WHERE n."status" = 'DELIVERED')::bigint AS delivered,
          COUNT(*) FILTER (WHERE n."status" IN ('FAILED', 'DLQ'))::bigint AS failed
        FROM "Notifications" n
        WHERE n."createdAt" >= ${query.from}
          AND n."createdAt" <  ${query.to}
        GROUP BY bucket
        ORDER BY 1 ASC
      `,
      this.db.$queryRaw<
        Array<{ bucket: Date; retried: bigint }>
      >`
        SELECT
          date_trunc(${trunc}, e."occurredAt") AS bucket,
          COUNT(*)::bigint AS retried
        FROM "NotificationEvents" e
        WHERE e."eventType" = 'RETRY_SCHEDULED'
          AND e."occurredAt" >= ${query.from}
          AND e."occurredAt" <  ${query.to}
        GROUP BY bucket
        ORDER BY 1 ASC
      `,
    ]);

    // Build a lookup map for retry counts keyed by bucket timestamp.
    const retryMap = new Map<string, number>();
    for (const row of retryBuckets) {
      retryMap.set(row.bucket.toISOString(), Number(row.retried));
    }

    return notificationBuckets.map((row) => ({
      date: row.bucket.toISOString(),
      created: Number(row.created),
      delivered: Number(row.delivered),
      failed: Number(row.failed),
      retried: retryMap.get(row.bucket.toISOString()) ?? 0,
    }));
  }

  async getChannelStatistics(): Promise<ChannelStat[]> {
    const rows = await this.db.notification.groupBy({
      by: ['channel'],
      _count: { id: true },
    });

    const results: ChannelStat[] = [];

    for (const row of rows) {
      const channel = row.channel;
      const total = row._count.id;

      const delivered = await this.db.notification.count({
        where: { channel, status: 'DELIVERED' },
      });

      const failed = await this.db.notification.count({
        where: { channel, status: { in: ['FAILED', 'DLQ'] } },
      });

      const successRate = total > 0 ? Math.round((delivered / total) * 1000) / 10 : 0;

      results.push({ channel, total, delivered, failed, successRate });
    }

    return results;
  }
}
