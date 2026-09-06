/**
 * Raw schema: a faithful load of the twelve source files. Wide snapshot columns
 * (aum_<date>, price_<date>, drawn_<date>, ...) are unpivoted into long tables so that
 * every derived figure can cite a single row.
 */
import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const raw = pgSchema('raw');

const money = () => numeric({ precision: 20, scale: 4, mode: 'number' });
const pct = () => numeric({ precision: 10, scale: 4, mode: 'number' });

export const snapshots = raw.table('snapshots', {
  snapshotDate: date().primaryKey(),
  ordinal: integer().notNull(),
  label: text().notNull(),
});

export const clients = raw.table('clients', {
  clientId: text().primaryKey(),
  clientName: text().notNull(),
  age: integer(),
  gender: text().notNull(),
  nationality: text().notNull(),
  countryOfResidence: text().notNull(),
  taxDomicile: text().notNull(),
  bookingCentre: text().notNull(),
  rmId: text().notNull(),
  rmName: text().notNull(),
  rmDesk: text().notNull(),
  baseCurrency: text().notNull(),
  wealthBand: text().notNull(),
  totalAumUsd: money().notNull(),
  lifeStage: text().notNull(),
  sourceOfWealth: text().notNull(),
  riskProfile: text().notNull(),
  riskToleranceScore: integer().notNull(),
  investmentHorizonYears: integer().notNull(),
  liquidityNeeds: text().notNull(),
  objectives: text().notNull(),
  clientSince: date().notNull(),
  kycReviewDue: date().notNull(),
  pepStatus: boolean().notNull(),
  reportingLanguage: text().notNull(),
});

export const mandates = raw.table(
  'mandates',
  {
    mandateCode: text().notNull(),
    mandateName: text().notNull(),
    assetClass: text().notNull(),
    minPct: pct().notNull(),
    targetPct: pct().notNull(),
    maxPct: pct().notNull(),
    maxSinglePositionPct: pct().notNull(),
    mandateNotes: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.mandateCode, t.assetClass] })],
);

export const portfolios = raw.table(
  'portfolios',
  {
    portfolioId: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => clients.clientId),
    portfolioName: text().notNull(),
    mandateCode: text().notNull(),
    mandateName: text().notNull(),
    serviceModel: text().notNull(),
    baseCurrency: text().notNull(),
    inceptionDate: date().notNull(),
    benchmark: text().notNull(),
    aumUsdCurrent: money().notNull(),
  },
  (t) => [index('portfolios_client_idx').on(t.clientId)],
);

export const portfolioAum = raw.table(
  'portfolio_aum',
  {
    portfolioId: text()
      .notNull()
      .references(() => portfolios.portfolioId),
    snapshotDate: date()
      .notNull()
      .references(() => snapshots.snapshotDate),
    aumBase: money().notNull(),
  },
  (t) => [primaryKey({ columns: [t.portfolioId, t.snapshotDate] })],
);

export const instruments = raw.table('instruments', {
  instrumentId: text().primaryKey(),
  instrumentName: text().notNull(),
  assetClass: text().notNull(),
  subAssetClass: text().notNull(),
  sector: text(),
  region: text().notNull(),
  currency: text().notNull(),
  liquidityTier: text().notNull(),
  underlyingReference: text(),
  sustainabilityExcluded: boolean().notNull(),
  concentrationLimitApplies: boolean().notNull(),
});

export const instrumentPrices = raw.table(
  'instrument_prices',
  {
    instrumentId: text()
      .notNull()
      .references(() => instruments.instrumentId),
    snapshotDate: date()
      .notNull()
      .references(() => snapshots.snapshotDate),
    priceLocal: money().notNull(),
  },
  (t) => [primaryKey({ columns: [t.instrumentId, t.snapshotDate] })],
);

export const holdings = raw.table(
  'holdings',
  {
    holdingId: integer().primaryKey().generatedAlwaysAsIdentity(),
    snapshotDate: date()
      .notNull()
      .references(() => snapshots.snapshotDate),
    portfolioId: text()
      .notNull()
      .references(() => portfolios.portfolioId),
    clientId: text()
      .notNull()
      .references(() => clients.clientId),
    instrumentId: text()
      .notNull()
      .references(() => instruments.instrumentId),
    instrumentName: text().notNull(),
    assetClass: text().notNull(),
    subAssetClass: text().notNull(),
    sector: text(),
    region: text().notNull(),
    instrumentCcy: text().notNull(),
    quantity: money().notNull(),
    priceLocal: money().notNull(),
    marketValueLocal: money().notNull(),
    portfolioCcy: text().notNull(),
    marketValueBase: money().notNull(),
    marketValueUsd: money().notNull(),
    weightPct: pct().notNull(),
    avgCostLocal: money(),
    costBasisBase: money(),
    unrealisedPnlBase: money(),
    unrealisedPnlPct: pct(),
    lendingValueBase: money().notNull(),
    advanceRatePct: pct().notNull(),
    liquidityTier: text().notNull(),
    valuationDate: date().notNull(),
    acquiredDate: date().notNull(),
  },
  (t) => [
    uniqueIndex('holdings_unique_position').on(t.portfolioId, t.snapshotDate, t.instrumentId),
    index('holdings_client_snapshot_idx').on(t.clientId, t.snapshotDate),
    index('holdings_instrument_idx').on(t.instrumentId),
  ],
);

export const transactions = raw.table(
  'transactions',
  {
    transactionId: text().primaryKey(),
    tradeDate: date().notNull(),
    settlementDate: date().notNull(),
    portfolioId: text()
      .notNull()
      .references(() => portfolios.portfolioId),
    clientId: text()
      .notNull()
      .references(() => clients.clientId),
    transactionType: text().notNull(),
    instrumentId: text().references(() => instruments.instrumentId),
    instrumentName: text(),
    quantity: money(),
    priceLocal: money(),
    currency: text().notNull(),
    amount: money().notNull(),
    narrative: text().notNull(),
  },
  (t) => [
    index('transactions_client_date_idx').on(t.clientId, t.tradeDate),
    index('transactions_portfolio_idx').on(t.portfolioId),
  ],
);

export const creditFacilities = raw.table('credit_facilities', {
  facilityId: text().primaryKey(),
  clientId: text()
    .notNull()
    .references(() => clients.clientId),
  collateralPortfolioId: text()
    .notNull()
    .references(() => portfolios.portfolioId),
  facilityType: text().notNull(),
  facilityCcy: text().notNull(),
  creditLimit: money().notNull(),
  interestRatePct: pct().notNull(),
  marginCallLtvPct: pct().notNull(),
  utilisationPctCurrent: pct().notNull(),
});

export const creditFacilitySnapshots = raw.table(
  'credit_facility_snapshots',
  {
    facilityId: text()
      .notNull()
      .references(() => creditFacilities.facilityId),
    snapshotDate: date()
      .notNull()
      .references(() => snapshots.snapshotDate),
    drawn: money().notNull(),
    collateralMarketValue: money().notNull(),
    lendingValue: money().notNull(),
    ltvPct: pct().notNull(),
    headroom: money().notNull(),
  },
  (t) => [primaryKey({ columns: [t.facilityId, t.snapshotDate] })],
);

export const commitments = raw.table('commitments', {
  commitmentId: text().primaryKey(),
  clientId: text()
    .notNull()
    .references(() => clients.clientId),
  portfolioId: text()
    .notNull()
    .references(() => portfolios.portfolioId),
  fundName: text().notNull(),
  currency: text().notNull(),
  committed: money().notNull(),
  calledToDate: money().notNull(),
  uncalled: money().notNull(),
  expectedCallWindow: text().notNull(),
});

export const plannedCashNeeds = raw.table('planned_cash_needs', {
  needId: text().primaryKey(),
  clientId: text()
    .notNull()
    .references(() => clients.clientId),
  description: text().notNull(),
  currency: text().notNull(),
  amount: money().notNull(),
  dueFrom: date().notNull(),
  dueTo: date().notNull(),
  recurrence: text().notNull(),
  certainty: text().notNull(),
});

export const marketContext = raw.table(
  'market_context',
  {
    snapshotDate: date()
      .notNull()
      .references(() => snapshots.snapshotDate),
    seriesId: text().notNull(),
    seriesName: text().notNull(),
    category: text().notNull(),
    unit: text().notNull(),
    value: numeric({ precision: 20, scale: 6, mode: 'number' }).notNull(),
    snapshotLabel: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.seriesId, t.snapshotDate] })],
);

export const eventLog = raw.table('event_log', {
  eventId: text().primaryKey(),
  eventDate: date().notNull(),
  eventType: text().notNull(),
  region: text().notNull(),
  description: text().notNull(),
  primaryTransmission: text().notNull(),
  severity: text().notNull(),
  ordinal: integer().notNull(),
});

/**
 * Relationship managers, their teams, and dated client assignments. The rm_* columns on clients
 * remain as the denormalised current primary for the engines; assignments are the source of truth
 * for who may see a client and who saw it when.
 */
export const teams = raw.table('teams', {
  teamId: text().primaryKey(),
  name: text().notNull(),
  desk: text().notNull().default(''),
  headRmId: text(),
});

export const rms = raw.table('rms', {
  rmId: text().primaryKey(),
  name: text().notNull(),
  desk: text().notNull().default(''),
  teamId: text().references(() => teams.teamId),
  email: text(),
  status: text().notNull().default('active'),
});

export const rmAssignments = raw.table(
  'rm_assignments',
  {
    id: uuid().primaryKey().defaultRandom(),
    clientId: text()
      .notNull()
      .references(() => clients.clientId),
    rmId: text()
      .notNull()
      .references(() => rms.rmId),
    /** primary | secondary | checker | cover */
    role: text().notNull().default('primary'),
    validFrom: date().notNull(),
    validTo: date(),
    source: text().notNull().default('dataset'),
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('rm_assignments_client_idx').on(t.clientId, t.validTo),
    index('rm_assignments_rm_idx').on(t.rmId, t.validTo),
  ],
);

export const rmNotes = raw.table(
  'rm_notes',
  {
    noteId: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => clients.clientId),
    noteDate: date().notNull(),
    rmId: text().notNull(),
    rmName: text().notNull(),
    channel: text().notNull(),
    note: text().notNull(),
  },
  (t) => [index('rm_notes_client_idx').on(t.clientId, t.noteDate)],
);

export const clientsRelations = relations(clients, ({ many }) => ({
  portfolios: many(portfolios),
  notes: many(rmNotes),
  cashNeeds: many(plannedCashNeeds),
  facilities: many(creditFacilities),
  commitments: many(commitments),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  client: one(clients, { fields: [portfolios.clientId], references: [clients.clientId] }),
  holdings: many(holdings),
  aum: many(portfolioAum),
}));

export const holdingsRelations = relations(holdings, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [holdings.portfolioId],
    references: [portfolios.portfolioId],
  }),
  instrument: one(instruments, {
    fields: [holdings.instrumentId],
    references: [instruments.instrumentId],
  }),
}));

export const rmNotesRelations = relations(rmNotes, ({ one }) => ({
  client: one(clients, { fields: [rmNotes.clientId], references: [clients.clientId] }),
}));
