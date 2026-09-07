/**
 * Kafka front door. One topic carries every message type (the envelope says which); the consumer
 * collects a small batch, applies it with the same function the batch adapter uses, and commits
 * offsets only after the apply returns. Bad messages land in ingest.staging_messages as rejected,
 * so a poison message never blocks the partition. After a batch that changed clients, the vector
 * service is asked to rebuild.
 */
import { Kafka, logLevel, type EachBatchPayload } from 'kafkajs';
import { applyMessages, closeDb, createDb } from '@jb/db';
import { loadIngestConfig } from './config.js';

const cfg = loadIngestConfig();
const db = createDb(cfg.INGEST_DATABASE_URL ?? cfg.DATABASE_URL, { scope: 'all' });
const kafka = new Kafka({
  clientId: cfg.KAFKA_CLIENT_ID,
  brokers: cfg.KAFKA_BROKERS.split(','),
  logLevel: logLevel.WARN,
});
const consumer = kafka.consumer({ groupId: cfg.KAFKA_GROUP_ID });

const log = (msg: string, extra: Record<string, unknown> = {}): void => {
  console.error(JSON.stringify({ at: new Date().toISOString(), msg, ...extra }));
};

async function rebuildVectors(changed: string[]): Promise<void> {
  if (!cfg.ANALYTICS_URL || changed.length === 0) {
    return;
  }
  try {
    const res = await fetch(`${cfg.ANALYTICS_URL}/vectors/build`, { method: 'POST' });
    log('vectors rebuilt', { status: res.status, changed: changed.length });
  } catch (err) {
    log('vector rebuild failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleBatch(payload: EachBatchPayload): Promise<void> {
  const { batch } = payload;
  const raws: unknown[] = [];
  for (const m of batch.messages) {
    if (!m.value) {
      continue;
    }
    try {
      raws.push(JSON.parse(m.value.toString('utf8')));
    } catch {
      raws.push({
        type: 'unparseable',
        key: `${batch.topic}:${batch.partition}:${m.offset}`,
        payload: { raw: m.value.toString('utf8').slice(0, 2000) },
      });
    }
  }
  const result = await applyMessages(db, raws, {
    topic: batch.topic,
    source: `kafka:${batch.topic}`,
  });
  log('batch applied', {
    partition: batch.partition,
    from: batch.firstOffset(),
    to: batch.lastOffset(),
    received: result.received,
    applied: result.applied,
    duplicates: result.duplicates,
    rejected: result.rejected.length,
    loadRunId: result.loadRunId,
  });
  for (const m of batch.messages) {
    payload.resolveOffset(m.offset);
  }
  await payload.heartbeat();
  await payload.commitOffsetsIfNecessary();
  await rebuildVectors(result.changedClients);
}

async function main(): Promise<void> {
  await consumer.connect();
  await consumer.subscribe({ topic: cfg.KAFKA_TOPIC, fromBeginning: true });
  log('consumer started', {
    brokers: cfg.KAFKA_BROKERS,
    topic: cfg.KAFKA_TOPIC,
    group: cfg.KAFKA_GROUP_ID,
  });
  await consumer.run({
    eachBatchAutoResolve: false,
    partitionsConsumedConcurrently: 1,
    eachBatch: handleBatch,
  });
}

const shutdown = async (): Promise<void> => {
  log('shutting down');
  await consumer.disconnect().catch(() => undefined);
  await closeDb(db);
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

main().catch((err: unknown) => {
  log('fatal', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
