import { Admin } from 'kafkajs';
import { createKafkaAdmin } from './kafka-client';
import { logger } from '../logger';

export interface KafkaHealthResult {
  status: 'ok' | 'error';
  latencyMs: number;
  brokersCount?: number;
  clusterId?: string;
  error?: string;
}

export class KafkaHealthIndicator {
  constructor(private readonly adminFactory: () => Admin = () => createKafkaAdmin()) {}

  async checkHealth(): Promise<KafkaHealthResult> {
    const start = Date.now();
    const admin = this.adminFactory();

    try {
      await admin.connect();
      const cluster = await admin.describeCluster();
      const latencyMs = Date.now() - start;

      return {
        status: 'ok',
        latencyMs,
        brokersCount: cluster.brokers.length,
        clusterId: cluster.clusterId,
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const errorMessage = (error as Error).message;
      logger.warn({ error: errorMessage, latencyMs }, 'Kafka health check failed');

      return {
        status: 'error',
        latencyMs,
        error: errorMessage,
      };
    } finally {
      try {
        await admin.disconnect();
      } catch {
        // Disconnect errors during health checks are ignored
      }
    }
  }
}

export const kafkaHealthIndicator = new KafkaHealthIndicator();
