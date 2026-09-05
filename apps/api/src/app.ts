import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { ClaudeGateway } from './llm/gateway.js';
import dbPlugin from './plugins/db.js';
import { ClientDetailRepository } from './repositories/clientDetailRepository.js';
import { ClientRepository } from './repositories/clientRepository.js';
import { DecisionRepository } from './repositories/decisionRepository.js';
import { DataQualityRepository } from './repositories/dataQualityRepository.js';
import { LoadRunRepository } from './repositories/loadRunRepository.js';
import { RubricRepository } from './repositories/rubricRepository.js';
import { SignalRepository } from './repositories/signalRepository.js';
import { VectorRepository } from './repositories/vectorRepository.js';
import { WorkflowRepository } from './repositories/workflowRepository.js';
import { clientDetailRoutes } from './routes/clientDetail.js';
import { clientRoutes } from './routes/clients.js';
import { dataQualityRoutes } from './routes/dataQuality.js';
import { healthRoutes } from './routes/health.js';
import { metaRoutes } from './routes/meta.js';
import { bookRoutes } from './routes/book.js';
import { riskRoutes } from './routes/risk.js';
import { rubricRoutes } from './routes/rubric.js';
import { signalRoutes } from './routes/signals.js';
import { vectorRoutes } from './routes/vectors.js';
import { workflowRoutes } from './routes/workflow.js';
import { AnalyticsClient } from './services/analyticsClient.js';
import { ClientDetailService } from './services/clientDetailService.js';
import { DatasetContext } from './services/datasetContext.js';
import { ClientService } from './services/clientService.js';
import { DataQualityService } from './services/dataQualityService.js';
import { HealthService } from './services/healthService.js';
import { BookService } from './services/bookService.js';
import { RiskService } from './services/riskService.js';
import { RubricService } from './services/rubricService.js';
import { SignalService } from './services/signalService.js';
import { VectorService } from './services/vectorService.js';
import { WorkflowService } from './services/workflowService.js';

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

  const ctx = new DatasetContext(app.db, config.DATASET_TODAY, config.DATASET_NAME);
  const loadRuns = new LoadRunRepository(app.db);
  const issues = new DataQualityRepository(app.db);
  const clients = new ClientRepository(app.db);
  const vectors = new VectorRepository(app.db);
  const detail = new ClientDetailRepository(app.db);
  const workflow = new WorkflowRepository(app.db);
  const signals = new SignalRepository(app.db);
  const rubric = new RubricRepository(app.db);
  const decisions = new DecisionRepository(app.db);
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

  const health = new HealthService(loadRuns, API_VERSION, ctx);
  const dataQuality = new DataQualityService(loadRuns, issues);
  const clientService = new ClientService(clients, ctx);
  const vectorService = new VectorService(vectors, new AnalyticsClient(config.ANALYTICS_URL));
  const detailService = new ClientDetailService(detail, ctx, workflow);
  const signalService = new SignalService(signals, detail, config.ANALYTICS_URL, ctx);
  const rubricService = new RubricService(
    rubric,
    vectors,
    detail,
    signals,
    gateway,
    config.ANALYTICS_URL,
    ctx,
  );
  const riskService = new RiskService(
    detail,
    signals,
    rubric,
    vectors,
    decisions,
    signalService,
    ctx,
  );
  const bookService = new BookService(clients, detail, signals, rubric, ctx, workflow);
  const workflowService = new WorkflowService(
    workflow,
    detail,
    rubric,
    decisions,
    signals,
    riskService,
    signalService,
    gateway,
    ctx,
    config.RM_LEVEL,
    config.CHECKER_ID,
  );

  await app.register(healthRoutes(health));
  await app.register(
    async (v1) => {
      await v1.register(dataQualityRoutes(dataQuality));
      await v1.register(clientRoutes(clientService));
      await v1.register(vectorRoutes(vectorService));
      await v1.register(metaRoutes(ctx));
      await v1.register(clientDetailRoutes(detailService, ctx));
      await v1.register(signalRoutes(signalService));
      await v1.register(rubricRoutes(rubricService));
      await v1.register(riskRoutes(riskService));
      await v1.register(bookRoutes(bookService));
      await v1.register(workflowRoutes(workflowService));
    },
    { prefix: '/api/v1' },
  );

  return app;
}
