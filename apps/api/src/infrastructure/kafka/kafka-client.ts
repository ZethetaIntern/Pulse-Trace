import { Kafka, Producer, Admin, logLevel as KafkaLogLevel, LogEntry } from 'kafkajs';
import { env } from '../../config/env';
import { logger } from '../logger';

function pinoLogCreator() {
  return ({ namespace, level, label, log }: LogEntry) => {
    const { message, ...extra } = log;
    const logData = { namespace, label, ...extra };
    switch (level) {
      case KafkaLogLevel.ERROR:
      case KafkaLogLevel.NOTHING:
        logger.error(logData, `[KafkaJS] ${message}`);
        break;
      case KafkaLogLevel.WARN:
        logger.warn(logData, `[KafkaJS] ${message}`);
        break;
      case KafkaLogLevel.INFO:
        logger.info(logData, `[KafkaJS] ${message}`);
        break;
      case KafkaLogLevel.DEBUG:
      default:
        logger.debug(logData, `[KafkaJS] ${message}`);
        break;
    }
  };
}

export function createKafkaInstance(customBrokers?: string[], customClientId?: string): Kafka {
  const brokers = customBrokers || env.kafkaBrokers;
  const clientId = customClientId || env.kafkaClientId;

  return new Kafka({
    clientId,
    brokers,
    logCreator: pinoLogCreator,
    logLevel: KafkaLogLevel.WARN,
    retry: {
      initialRetryTime: 100,
      retries: 5,
    },
  });
}

export function createKafkaProducer(kafka?: Kafka): Producer {
  const client = kafka || createKafkaInstance();
  return client.producer({
    allowAutoTopicCreation: false,
    idempotent: true,
  });
}

export function createKafkaAdmin(kafka?: Kafka): Admin {
  const client = kafka || createKafkaInstance();
  return client.admin();
}
