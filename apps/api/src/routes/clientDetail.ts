import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { SnapshotDateSchema } from '@jb/contracts';
import type { ClientDetailService } from '../services/clientDetailService.js';
import type { DatasetContext } from '../services/datasetContext.js';
import { ClientNotFoundError } from '../services/vectorService.js';

const Params = z.object({ clientId: z.string().min(1).max(64) });
const SnapshotQuery = z.object({ snapshot: SnapshotDateSchema.optional() });
const HoldingsQuery = SnapshotQuery.extend({
  portfolio: z
    .string()
    .regex(/^PF-\d{4}$/)
    .optional(),
});
const ChangeQuery = z.object({
  from: SnapshotDateSchema.optional(),
  to: SnapshotDateSchema.optional(),
});
const TxQuery = z.object({
  portfolio: z
    .string()
    .regex(/^PF-\d{4}$/)
    .optional(),
  type: z.string().max(40).optional(),
});

export const clientDetailRoutes =
  (service: ClientDetailService, ctx: DatasetContext): FastifyPluginCallback =>
  (app, _opts, done) => {
    const handle =
      <Q>(querySchema: z.ZodType<Q>, run: (clientId: string, q: Q) => Promise<unknown>) =>
      async (
        req: { params: unknown; query: unknown },
        reply: { badRequest: (m: string) => unknown; notFound: (m: string) => unknown },
      ) => {
        const p = Params.safeParse(req.params);
        if (!p.success) {
          return reply.badRequest('clientId is required');
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
      handle(HoldingsQuery, async (id, q) =>
        service.holdings(id, q.snapshot ?? (await ctx.meta()).current, q.portfolio),
      ),
    );
    app.get(
      '/clients/:clientId/exposure',
      handle(SnapshotQuery, async (id, q) =>
        service.exposure(id, q.snapshot ?? (await ctx.meta()).current),
      ),
    );
    app.get(
      '/clients/:clientId/mandate',
      handle(SnapshotQuery, async (id, q) =>
        service.mandate(id, q.snapshot ?? (await ctx.meta()).current),
      ),
    );
    app.get(
      '/clients/:clientId/change',
      handle(ChangeQuery, async (id, q) => {
        const m = await ctx.meta();
        return service.change(id, q.from ?? m.baseline, q.to ?? m.current);
      }),
    );
    app.get(
      '/clients/:clientId/notes',
      handle(z.object({}), (id) => service.notes(id)),
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
