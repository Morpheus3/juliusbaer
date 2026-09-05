import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { ClaudeGateway } from './llm/gateway.js';
import dbPlugin from './plugins/db.js';
import { ClientDetailRepository } from './repositories/clientDetailRepository.js';
import { ClientRepository } from './repositories/clientRepository.js';
import { DataQualityRepository } from './repositories/dataQualityRepository.js';
import { LoadRunRepository } from './repositories/loadRunRepository.js';
import { RubricRepository } from './repositories/rubricRepository.js';
import { SignalRepository } from './repositories/signalRepository.js';
import { VectorRepository } from './repositories/vectorRepository.js';
import { clientDetailRoutes } from './routes/clientDetail.js';
import { clientRoutes } from './routes/clients.js';
import { dataQualityRoutes } from './routes/dataQuality.js';
import { healthRoutes } from './routes/health.js';
import { rubricRoutes } from './routes/rubric.js';
import { signalRoutes } from './routes/signals.js';
import { vectorRoutes } from './routes/vectors.js';
import { AnalyticsClient } from './services/analyticsClient.js';
import { ClientDetailService } from './services/clientDetailService.js';
import { ClientService } from './services/clientService.js';
import { DataQualityService } from './services/dataQualityService.js';
import { HealthService } from './services/healthService.js';
import { RubricService } from './services/rubricService.js';
import { SignalService } from './services/signalService.js';
import { VectorService } from './services/vectorService.js';

export const API_VERSION = '0.1.0';

/** Composes the server: plugins, then repositories, services and routes. */
export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(process.env.NODE_ENV !== 'production' ? { transport: { target: 'pino-pretty' } } : {}),
    },
  });

  await app.register(sensible);
  await app.register(cors, { origin: config.CORS_ORIGIN });
  await app.register(dbPlugin, { connectionString: config.DATABASE_URL });

  const loadRuns = new LoadRunRepository(app.db);
  const issues = new DataQualityRepository(app.db);
  const clients = new ClientRepository(app.db);
  const vectors = new VectorRepository(app.db);
  const detail = new ClientDetailRepository(app.db);
  const signals = new SignalRepository(app.db);
  const rubric = new RubricRepository(app.db);
  const gateway = new ClaudeGateway(
    {
      apiKey: config.ANTHROPIC_API_KEY,
      analysisModel: config.CLAUDE_ANALYSIS_MODEL,
      fastModel: config.CLAUDE_FAST_MODEL,
      record: config.CLAUDE_RECORD,
    },
    app.db,
  );
  app.log.info({ mode: gateway.mode, model: config.CLAUDE_ANALYSIS_MODEL }, 'claude gateway');

  const health = new HealthService(loadRuns, API_VERSION, config.DATASET_TODAY);
  const dataQuality = new DataQualityService(loadRuns, issues);
  const clientService = new ClientService(clients, config.DATASET_TODAY);
  const vectorService = new VectorService(vectors, new AnalyticsClient(config.ANALYTICS_URL));
  const detailService = new ClientDetailService(detail, config.DATASET_TODAY);
  const signalService = new SignalService(
    signals,
    detail,
    config.ANALYTICS_URL,
    config.DATASET_TODAY,
  );
  const rubricService = new RubricService(
    rubric,
    vectors,
    detail,
    signals,
    gateway,
    config.ANALYTICS_URL,
    config.DATASET_TODAY,
  );

  await app.register(healthRoutes(health));
  await app.register(
    async (v1) => {
      await v1.register(dataQualityRoutes(dataQuality));
      await v1.register(clientRoutes(clientService));
      await v1.register(vectorRoutes(vectorService));
      await v1.register(clientDetailRoutes(detailService));
      await v1.register(signalRoutes(signalService));
      await v1.register(rubricRoutes(rubricService));
    },
    { prefix: '/api/v1' },
  );

  return app;
}
