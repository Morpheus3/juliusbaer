import type {
  AddPromiseRequest,
  PromiseCandidate,
  PromiseView,
  PromisesResponse,
} from '@jb/contracts';
import { daysBetween } from '../domain/dates.js';
import { extractPromises } from '../domain/promises/extract.js';
import { sha256 } from '../llm/prompts/registry.js';
import type { ClientDetailRepository } from '../repositories/clientDetailRepository.js';
import type { ClientRepository } from '../repositories/clientRepository.js';
import type {
  PromiseInsert,
  PromiseRepository,
  PromiseRow,
} from '../repositories/promiseRepository.js';
import type { DatasetContext } from './datasetContext.js';
import { ClientNotFoundError } from './vectorService.js';

const METHOD = [
  'Promises are extracted from the RM notes by sentence: a commitment verb with the RM as subject is an RM promise; one with the client as subject is a client promise; a decision agreed and not executed is decision debt. The sentence is stored verbatim as the quote.',
  'Due dates are read from the sentence when it names one (a date, a month, a quarter, “by Friday”, “mid-2027”); otherwise the promise is undated.',
  'Extraction is idempotent: a promise is keyed by client and quote, so re-reading the notes never duplicates it. Promises from calls and by hand carry their source.',
  'Resolving a promise is an RM action. Overdue open promises raise the client in the call plan through the relationship-debt term.',
];

/** The promise ledger: extraction from notes, additions from calls and by hand, resolution. */
export class PromiseService {
  constructor(
    private readonly repo: PromiseRepository,
    private readonly detail: ClientDetailRepository,
    private readonly clients: ClientRepository,
    private readonly ctx: DatasetContext,
  ) {}

  /** Re-extracts from the notes (idempotent) and lists the client's ledger. */
  async list(clientId: string, clock: string | undefined): Promise<PromisesResponse> {
    const meta = await this.ctx.meta();
    const at = clock && clock < meta.today ? clock : meta.today;
    const bundle = await this.detail.bundle(clientId);
    if (!bundle) {
      throw new ClientNotFoundError(clientId);
    }
    const candidates: PromiseInsert[] = [];
    for (const n of bundle.notes) {
      for (const c of extractPromises(n.note, n.noteDate)) {
        candidates.push(this.toInsert(clientId, c, 'note', n.noteId, 'system'));
      }
    }
    const extractedNow = await this.repo.upsert(candidates);
    const rows = await this.repo.forClient(clientId);
    const noteDates = new Map(bundle.notes.map((n) => [n.noteId, n.noteDate]));
    return {
      clientId,
      clock: at,
      promises: rows.map((r) =>
        this.view(r, bundle.client.clientName, at, noteDates.get(r.sourceRef ?? '') ?? null),
      ),
      extractedNow,
      method: METHOD,
    };
  }

  /** Every open promise across the book, overdue first. Extraction is not re-run here. */
  async openAll(clock: string | undefined): Promise<PromisesResponse> {
    const meta = await this.ctx.meta();
    const at = clock && clock < meta.today ? clock : meta.today;
    const [rows, clients] = await Promise.all([this.repo.open(), this.clients.listAll()]);
    const names = new Map(clients.map((c) => [c.clientId, c.clientName]));
    const views = rows.map((r) => this.view(r, names.get(r.clientId) ?? r.clientId, at, null));
    views.sort((a, b) => (b.overdueDays ?? -9999) - (a.overdueDays ?? -9999));
    return { clientId: null, clock: at, promises: views, extractedNow: 0, method: METHOD };
  }

  /** Open promises past due per client at the clock, for the call plan. */
  async overdueByClient(clock: string): Promise<Map<string, number>> {
    const rows = await this.repo.open();
    const out = new Map<string, number>();
    for (const r of rows) {
      if (r.dueDate && r.dueDate < clock) {
        out.set(r.clientId, (out.get(r.clientId) ?? 0) + 1);
      }
    }
    return out;
  }

  preview(text: string, date: string): PromiseCandidate[] {
    return extractPromises(text, date);
  }

  async add(
    clientId: string,
    req: AddPromiseRequest,
    sourceKind: 'manual' | 'call' | 'assistant',
    sourceRef: string | null,
  ): Promise<PromiseView> {
    const meta = await this.ctx.meta();
    const bundle = await this.detail.bundle(clientId);
    if (!bundle) {
      throw new ClientNotFoundError(clientId);
    }
    const row = await this.repo.add(
      this.toInsert(
        clientId,
        {
          party: req.party,
          kind: req.kind,
          text: req.text,
          quote: req.quote ?? req.text,
          dueDate: req.dueDate ?? null,
        },
        sourceKind,
        sourceRef,
        meta.rm.id,
      ),
    );
    return this.view(row, bundle.client.clientName, meta.today, null);
  }

  async resolve(id: string, status: 'done' | 'dropped'): Promise<PromiseView | null> {
    const meta = await this.ctx.meta();
    const row = await this.repo.resolve(id, status);
    if (!row) {
      return null;
    }
    const clients = await this.clients.listAll();
    return this.view(
      row,
      clients.find((c) => c.clientId === row.clientId)?.clientName ?? row.clientId,
      meta.today,
      null,
    );
  }

  private toInsert(
    clientId: string,
    c: PromiseCandidate,
    sourceKind: PromiseInsert['sourceKind'],
    sourceRef: string | null,
    actor: string,
  ): PromiseInsert {
    return {
      clientId,
      party: c.party,
      kind: c.kind,
      text: c.text,
      quote: c.quote,
      sourceKind,
      sourceRef,
      dueDate: c.dueDate,
      status: 'open',
      actor,
      fingerprint: sha256(`${clientId}|${c.quote}`),
    };
  }

  private view(
    r: PromiseRow,
    clientName: string,
    clock: string,
    sourceDate: string | null,
  ): PromiseView {
    return {
      id: r.id,
      clientId: r.clientId,
      clientName,
      party: r.party as PromiseView['party'],
      kind: r.kind as PromiseView['kind'],
      text: r.text,
      quote: r.quote,
      sourceKind: r.sourceKind as PromiseView['sourceKind'],
      sourceRef: r.sourceRef,
      sourceDate,
      dueDate: r.dueDate,
      status: r.status as PromiseView['status'],
      actor: r.actor,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      overdueDays: r.dueDate && r.status === 'open' ? daysBetween(r.dueDate, clock) : null,
    };
  }
}
