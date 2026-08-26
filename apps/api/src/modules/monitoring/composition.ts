import { BullMQMonitoringRepository } from './repositories/bullmq-monitoring-repository';
import { MonitoringServiceImpl } from './services/monitoring-service';
import { MonitoringRepository } from './interfaces/monitoring-repository';
import { MonitoringService } from './interfaces/monitoring-service';

const monitoringRepository: MonitoringRepository = new BullMQMonitoringRepository();

export const monitoringService: MonitoringService = new MonitoringServiceImpl(monitoringRepository);
export { monitoringRepository };