/**
 * Reads and validates the twelve source files. Validation failures are collected per
 * file and reported together so a single run tells you everything that is wrong.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import type { z } from 'zod';
import {
  ClientRow,
  CommitmentRow,
  CreditFacilityRow,
  EventLogRow,
  HoldingRow,
  InstrumentRow,
  MandateRow,
  MarketContextRow,
  PlannedCashNeedRow,
  PortfolioRow,
  RmNoteRow,
  TransactionRow,
} from '@jb/contracts';

export interface Snapshot {
  date: string;
  ordinal: number;
  label: string;
}

export interface Dataset {
  /** Discovered from holdings; labels from market_context.snapshot_label when present. */
  snapshots: Snapshot[];
  clients: ClientRow[];
  portfolios: PortfolioRow[];
  holdings: HoldingRow[];
  instruments: InstrumentRow[];
  mandates: MandateRow[];
  transactions: TransactionRow[];
  creditFacilities: CreditFacilityRow[];
  commitments: CommitmentRow[];
  plannedCashNeeds: PlannedCashNeedRow[];
  marketContext: MarketContextRow[];
  eventLog: EventLogRow[];
  rmNotes: RmNoteRow[];
}

export class DatasetValidationError extends Error {
  constructor(
    readonly file: string,
    readonly problems: string[],
  ) {
    super(`${file}: ${problems.length} invalid row(s)\n  ${problems.slice(0, 10).join('\n  ')}`);
    this.name = 'DatasetValidationError';
  }
}

function validateRows<T extends z.ZodType>(
  file: string,
  schema: T,
  rows: unknown[],
): z.output<T>[] {
  const out: z.output<T>[] = [];
  const problems: string[] = [];
  rows.forEach((row, i) => {
    const result = schema.safeParse(row);
    if (result.success) {
      out.push(result.data);
    } else {
      const first = result.error.issues[0];
      problems.push(`row ${i + 2}: ${first?.path.join('.') ?? '?'} ${first?.message ?? ''}`);
    }
  });
  if (problems.length > 0) {
    throw new DatasetValidationError(file, problems);
  }
  return out;
}

async function readCsv<T extends z.ZodType>(
  dir: string,
  file: string,
  schema: T,
): Promise<z.output<T>[]> {
  const text = await readFile(path.join(dir, file), 'utf8');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: false,
  });
  return validateRows(file, schema, records);
}

async function readJson<T extends z.ZodType>(
  dir: string,
  file: string,
  schema: T,
): Promise<z.output<T>[]> {
  const text = await readFile(path.join(dir, file), 'utf8');
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new DatasetValidationError(file, ['expected a JSON array']);
  }
  return validateRows(file, schema, parsed);
}

export async function readDataset(dir: string): Promise<Dataset> {
  const [
    clients,
    portfolios,
    holdings,
    instruments,
    mandates,
    transactions,
    creditFacilities,
    commitments,
    plannedCashNeeds,
    marketContext,
    eventLog,
    rmNotes,
  ] = await Promise.all([
    readCsv(dir, 'clients.csv', ClientRow),
    readCsv(dir, 'portfolios.csv', PortfolioRow),
    readCsv(dir, 'holdings.csv', HoldingRow),
    readCsv(dir, 'instruments.csv', InstrumentRow),
    readCsv(dir, 'mandates.csv', MandateRow),
    readCsv(dir, 'transactions.csv', TransactionRow),
    readCsv(dir, 'credit_facilities.csv', CreditFacilityRow),
    readCsv(dir, 'commitments.csv', CommitmentRow),
    readCsv(dir, 'planned_cash_needs.csv', PlannedCashNeedRow),
    readCsv(dir, 'market_context.csv', MarketContextRow),
    readCsv(dir, 'event_log.csv', EventLogRow),
    readJson(dir, 'rm_notes.json', RmNoteRow),
  ]);
  const snapshots = discoverSnapshots(holdings, marketContext);
  return {
    snapshots,
    clients,
    portfolios,
    holdings,
    instruments,
    mandates,
    transactions,
    creditFacilities,
    commitments,
    plannedCashNeeds,
    marketContext,
    eventLog,
    rmNotes,
  };
}

function discoverSnapshots(holdings: HoldingRow[], market: MarketContextRow[]): Snapshot[] {
  const dates = [...new Set(holdings.map((h) => h.snapshot_date))].sort();
  if (dates.length === 0) {
    throw new DatasetValidationError('holdings.csv', ['no snapshot dates found']);
  }
  const labels = new Map<string, string>();
  for (const m of market) {
    if (m.snapshot_label && !labels.has(m.snapshot_date)) {
      labels.set(m.snapshot_date, m.snapshot_label);
    }
  }
  return dates.map((date, ordinal) => ({
    date,
    ordinal,
    label:
      labels.get(date) ??
      (ordinal === 0
        ? 'Baseline'
        : ordinal === dates.length - 1
          ? 'Current'
          : `Snapshot ${ordinal + 1}`),
  }));
}

/** Reads `<prefix>_<date>` wide cells from a row as numbers, for the given snapshot dates. */
export function wideSeries(
  row: Record<string, unknown>,
  prefix: string,
  dates: readonly string[],
  file: string,
  id: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of dates) {
    const raw = row[`${prefix}_${d}`];
    if (raw === undefined || raw === '') {
      throw new DatasetValidationError(file, [`${id}: missing column ${prefix}_${d}`]);
    }
    const n = Number(raw);
    if (Number.isNaN(n)) {
      throw new DatasetValidationError(file, [`${id}: ${prefix}_${d} is not a number`]);
    }
    out.set(d, n);
  }
  return out;
}
