import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { BASELINE_SNAPSHOT, CURRENT_SNAPSHOT, SnapshotDateSchema } from '@jb/contracts';
import type { ClientDetailService } from '../services/clientDetailService.js';
import { ClientNotFoundError } from '../services/vectorService.js';

const CURRENT = CURRENT_SNAPSHOT;
const BASELINE = BASELINE_SNAPSHOT;

const Params = z.object({ clientId: z.string().regex(/^CL-\d{4}$/) });
const SnapshotQuery = z.object({ snapshot: SnapshotDateSchema.default(CURRENT) });
const HoldingsQuery = SnapshotQuery.extend({
  portfolio: z
    .string()
    .regex(/^PF-\d{4}$/)
    .optional(),
});
const ChangeQuery = z.object({
  from: SnapshotDateSchema.default(BASELINE),
  to: SnapshotDateSchema.default(CURRENT),
});
const TxQuery = z.object({
  portfolio: z
    .string()
    .regex(/^PF-\d{4}$/)
    .optional(),
  type: z.string().max(40).optional(),
});

export const clientDetailRoutes =
  (service: ClientDetailService): FastifyPluginCallback =>
  (app, _opts, done) => {
    const handle =
      <Q>(querySchema: z.ZodType<Q>, run: (clientId: string, q: Q) => Promise<unknown>) =>
      async (
        req: { params: unknown; query: unknown },
        reply: { badRequest: (m: string) => unknown; notFound: (m: string) => unknown },
      ) => {
        const p = Params.safeParse(req.params);
        if (!p.success) {
          return reply.badRequest('clientId must look like CL-0001');
        }
        const q = querySchema.safeParse(req.query);
        if (!q.success) {
          return reply.badRequest(
            q.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          );
        }
        try {
          return await run(p.data.clientId, q.data);
        } catch (err) {
          if (err instanceof ClientNotFoundError) {
            return reply.notFound(err.message);
          }
          throw err;
        }
      };

    app.get(
      '/clients/:clientId/overview',
      handle(z.object({}), (id) => service.overview(id)),
    );
    app.get(
      '/clients/:clientId/holdings',
      handle(HoldingsQuery, (id, q) => service.holdings(id, q.snapshot, q.portfolio)),
    );
    app.get(
      '/clients/:clientId/exposure',
      handle(SnapshotQuery, (id, q) => service.exposure(id, q.snapshot)),
    );
    app.get(
      '/clients/:clientId/mandate',
      handle(SnapshotQuery, (id, q) => service.mandate(id, q.snapshot)),
    );
    app.get(
      '/clients/:clientId/change',
      handle(ChangeQuery, (id, q) => service.change(id, q.from, q.to)),
    );
    app.get(
      '/clients/:clientId/cashflows',
      handle(z.object({}), (id) => service.cashflows(id)),
    );
    app.get(
      '/clients/:clientId/transactions',
      handle(TxQuery, (id, q) => service.transactions(id, q.portfolio, q.type)),
    );
    done();
  };
