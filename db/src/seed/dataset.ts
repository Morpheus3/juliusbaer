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

export interface Dataset {
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
  return {
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
