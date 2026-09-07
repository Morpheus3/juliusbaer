/**
 * Publishes message files to the ingest topic, for development and demos:
 *   npm run produce -w @jb/ingest -- data/messages/sample
 */
import path from 'node:path';
import { Kafka, logLevel } from 'kafkajs';
import { readMessageDir, repoRoot } from '@jb/db';
import { loadIngestConfig } from './config.js';

const cfg = loadIngestConfig();
const dir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot(), 'data', 'messages', 'sample');
const messages = await readMessageDir(dir);
const kafka = new Kafka({
  clientId: `${cfg.KAFKA_CLIENT_ID}-producer`,
  brokers: cfg.KAFKA_BROKERS.split(','),
  logLevel: logLevel.WARN,
});
const admin = kafka.admin();
await admin.connect();
const topics = await admin.listTopics();
if (!topics.includes(cfg.KAFKA_TOPIC)) {
  await admin.createTopics({ topics: [{ topic: cfg.KAFKA_TOPIC, numPartitions: 3 }] });
}
await admin.disconnect();
const producer = kafka.producer();
await producer.connect();
await producer.send({
  topic: cfg.KAFKA_TOPIC,
  messages: messages.map((m) => {
    const env = m as { key?: string; payload?: { clientId?: string; client_id?: string } };
    // Partition by client so a client's changes stay ordered.
    const key = env.payload?.clientId ?? env.payload?.client_id ?? env.key ?? null;
    return { key, value: JSON.stringify(m) };
  }),
});
await producer.disconnect();
console.error(
  `published ${messages.length} messages from ${dir} to ${cfg.KAFKA_TOPIC} at ${cfg.KAFKA_BROKERS}`,
);
