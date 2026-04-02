import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Partitioners } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka: Kafka;
  private producer: Producer;
  private connected = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const broker = this.configService.get<string>('KAFKA_BROKER');
    if (!broker) {
      console.warn('KafkaService: KAFKA_BROKER not configured — Kafka will be disabled');
      return;
    }

    this.kafka = new Kafka({
      clientId: 'tap-trading-backend',
      brokers: [broker],
    });

    this.producer = this.kafka.producer({
      createPartitioner: Partitioners.LegacyPartitioner,
    });

    try {
      await this.producer.connect();
      this.connected = true;
      console.log('Kafka producer connected');
    } catch (err) {
      console.error('Kafka producer connection failed:', err);
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.producer.disconnect();
    }
  }

  async emit(topic: string, message: Record<string, unknown>): Promise<void> {
    if (!this.connected) {
      console.warn(`Kafka not connected — skipping emit to ${topic}`);
      return;
    }

    const prefix = this.configService.get<string>('KAFKA_TOPIC_PREFIX') ?? '';
    const fullTopic = prefix ? `${prefix}-${topic}` : topic;

    await this.producer.send({
      topic: fullTopic,
      messages: [{ value: JSON.stringify(message) }],
    });
  }
}
