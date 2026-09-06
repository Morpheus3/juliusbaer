import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { ClaudeGateway } from './llm/gateway.js';
import dbPlugin from './plugins/db.js';
import { AssistantTools } from './assistant/tools.js';
import { CallPlanRepository } from './repositories/callPlanRepository.js';
import { PromiseRepository } from './repositories/promiseRepository.js';
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
import { assistantRoutes } from './routes/assistant.js';
import { bookRoutes } from './routes/book.js';
import { companionRoutes } from './routes/companion.js';
import { promiseRoutes } from './routes/promises.js';
import { riskRoutes } from './routes/risk.js';
import { rubricRoutes } from './routes/rubric.js';
import { settingsRoutes } from './routes/settings.js';
import { signalRoutes } from './routes/signals.js';
import { vectorRoutes } from './routes/vectors.js';
import { workflowRoutes } from './routes/workflow.js';
import { AnalyticsClient } from './services/analyticsClient.js';
import { AssistantService } from './services/assistantService.js';
import { CallPlanService } from './services/callPlanService.js';
import { CompanionService } from './services/companionService.js';
import { IdeasService } from './services/ideasService.js';
import { PromiseService } from './services/promiseService.js';
import { ClientDetailService } from './services/clientDetailService.js';
import { DatasetContext } from './services/datasetContext.js';
import { ClientService } from './services/clientService.js';
import { DataQualityService } from './services/dataQualityService.js';
import { HealthService } from './services/healthService.js';
import { BookService } from './services/bookService.js';
import { RiskService } from './services/riskService.js';
import { RubricService } from './services/rubricService.js';
import { SettingsService } from './services/settingsService.js';
import { SignalService } from './services/signalService.js';
import { VectorService } from './services/vectorService.js';
import { WorkflowService } from './services/workflowService.js';

export const API_VERSION = '0.1.0';

/** Composes the server: plugins, then repositories, services and routes. */
export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.body.apiKey'],
      ...(process.env.NODE_ENV !== 'production' ? { transport: { target: 'pino-pretty' } } : {}),
    },
  });

  await app.register(sensible);
  await app.register(cors, { origin: config.CORS_ORIGIN });
  // Global ceiling; LLM-backed and heavy routes set a stricter per-route limit via config.rateLimit.
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
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
  const settingsService = new SettingsService(gateway);

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
  const callPlanRepo = new CallPlanRepository(app.db);
  const promiseRepo = new PromiseRepository(app.db);
  const promiseService = new PromiseService(promiseRepo, detail, clients, ctx);
  const callPlanService = new CallPlanService(bookService, callPlanRepo, ctx, promiseService);
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

  const ideasService = new IdeasService(bookService, rubric, signalService, workflow);
  const assistantService = new AssistantService(
    ctx,
    clients,
    new AssistantTools(
      ctx,
      bookService,
      callPlanService,
      detailService,
      signalService,
      riskService,
      rubricService,
      workflowService,
      promiseService,
      ideasService,
    ),
    gateway,
    signalService,
    riskService,
    rubricService,
    workflowService,
    callPlanService,
    callPlanRepo,
  );

  const companionService = new CompanionService(
    ctx,
    detail,
    rubric,
    promiseRepo,
    promiseService,
    callPlanService,
    workflowService,
    callPlanRepo,
  );
  await app.register(healthRoutes(health));
  await app.register(
    async (v1) => {
      await v1.register(dataQualityRoutes(dataQuality));
      await v1.register(clientRoutes(clientService));
      await v1.register(vectorRoutes(vectorService));
      await v1.register(metaRoutes(ctx));
      await v1.register(settingsRoutes(settingsService));
      await v1.register(clientDetailRoutes(detailService, ctx));
      await v1.register(signalRoutes(signalService));
      await v1.register(rubricRoutes(rubricService));
      await v1.register(riskRoutes(riskService));
      await v1.register(bookRoutes(bookService, callPlanService));
      await v1.register(workflowRoutes(workflowService));
      await v1.register(assistantRoutes(assistantService));
      await v1.register(promiseRoutes(promiseService));
      await v1.register(companionRoutes(companionService, ideasService));
    },
    { prefix: '/api/v1' },
  );

  return app;
}
