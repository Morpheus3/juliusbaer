import { describe, expect, it } from 'vitest';
import { CallPolicy, type HorizonItem } from '@jb/contracts';
import {
  addBusinessDays,
  buildEntry,
  clockFactor,
  dampedThemes,
  deadlineFor,
  packDays,
  scoreClient,
  slotFor,
  tzOffsetHours,
  type CallPlanClientInput,
} from './callPlan.js';

const policy = CallPolicy.parse({
  rmHours: { timezone: 'Asia/Singapore', start: 9, end: 18 },
  timezoneByCountry: { Switzerland: 'Europe/Zurich', 'Hong Kong SAR': 'Asia/Hong_Kong' },
  themeKeywords: { collateral: ['collateral', 'ltv'] },
});
const CLOCK = '2026-08-26'; // a Wednesday

const item = (over: Partial<HorizonItem>): HorizonItem => ({
  id: 'i',
  clientId: 'C',
  clientName: 'C',
  lane: 'week',
  previousLane: null,
  momentum: 'same',
  theme: 'concentration',
  severity: 'medium',
  title: 't',
  detail: '',
  laneReason: '',
  dueDate: null,
  evidence: {},
  link: '',
  ...over,
});
const client = (over: Partial<CallPlanClientInput>): CallPlanClientInput => ({
  clientId: 'C',
  clientName: 'Client',
  wealthBand: 'UHNW',
  countryOfResidence: 'Hong Kong SAR',
  reportingLanguage: 'English',
  aumUsd: 1,
  items: [],
  ltvTrend: [],
  snapshotIntervalDays: 57,
  notes: [],
  kycReviewDue: '2027-01-01',
  clientSince: '2019-01-01',
  deferral: null,
  doneAtClock: null,
  overduePromises: 0,
  ...over,
});

describe('dates', () => {
  it('skips weekends when adding business days', () => {
    expect(addBusinessDays('2026-08-28', 1)).toBe('2026-08-31'); // Fri → Mon
    expect(addBusinessDays('2026-08-26', 0)).toBe('2026-08-26');
    expect(addBusinessDays('2026-08-29', 0)).toBe('2026-08-31'); // Sat → Mon
  });
  it('doubles an item due today and leaves one due in a month alone', () => {
    expect(clockFactor(0)).toBe(2);
    expect(clockFactor(15)).toBe(1.5);
    expect(clockFactor(30)).toBe(1);
    expect(clockFactor(90)).toBe(1);
  });
});

describe('deadlineFor', () => {
  it('projects a collateral breach from the headroom trend', () => {
    const inp = client({ ltvTrend: [{ facilityId: 'F', headroomNow: 0.6, headroomPrev: 2.0 }] });
    const dl = deadlineFor(
      item({ theme: 'collateral', severity: 'high', lane: 'now', evidence: { facilityId: 'F' } }),
      inp,
      policy,
      CLOCK,
    );
    // 0.6 / 1.4 × 57 ≈ 24 days
    expect(dl?.date).toBe('2026-09-19');
  });
  it('takes the lead time off a cash need and leaves KYC as dated', () => {
    expect(
      deadlineFor(item({ theme: 'liquidity', dueDate: '2026-11-01' }), client({}), policy, CLOCK)
        ?.date,
    ).toBe('2026-10-02');
    expect(
      deadlineFor(item({ theme: 'compliance', dueDate: '2026-09-22' }), client({}), policy, CLOCK)
        ?.date,
    ).toBe('2026-09-22');
  });
  it('gives a severe signal a freshness window in business days', () => {
    expect(
      deadlineFor(item({ theme: 'signal', severity: 'high' }), client({}), policy, CLOCK)?.date,
    ).toBe('2026-08-31');
    expect(
      deadlineFor(item({ theme: 'signal', severity: 'medium' }), client({}), policy, CLOCK),
    ).toBeNull();
  });
});

describe('scoreClient', () => {
  it('reports the five terms and sums them', () => {
    const inp = client({
      items: [
        item({
          id: 'a',
          theme: 'collateral',
          lane: 'now',
          severity: 'high',
          evidence: { facilityId: 'F' },
        }),
        item({ id: 'b', theme: 'concentration', lane: 'week', severity: 'high' }),
        item({
          id: 'c',
          theme: 'liquidity',
          lane: 'week',
          severity: 'medium',
          dueDate: '2026-11-01',
        }),
      ],
      ltvTrend: [{ facilityId: 'F', headroomNow: 0.6, headroomPrev: 2.0 }],
      notes: [{ date: '2026-08-02', channel: 'Meeting', text: 'general' }],
    });
    const s = scoreClient(inp, policy, CLOCK);
    const by = Object.fromEntries(s.terms.map((t) => [t.term, t.points]));
    expect(by.harm).toBe(9 + 6 + 4);
    expect(by.convergence).toBe(4); // three themes among now/week items
    expect(by.relationship).toBe(0); // 24 days within a 30-day cadence
    expect(by.damper).toBe(0);
    expect(by.clock).toBeGreaterThan(0);
    expect(s.priority).toBe(Math.round((19 + 4 + (by.clock ?? 0)) * 10) / 10);
    expect(s.dueBy).toBe('2026-08-26'); // a Now item is due today, ahead of the projected breach
  });
  it('adds relationship debt for a quiet client and falls back to the lane for due-by', () => {
    const s = scoreClient(
      client({
        items: [item({ lane: 'week' })],
        notes: [{ date: '2026-06-10', channel: 'Call', text: 'x' }],
      }),
      policy,
      CLOCK,
    );
    const by = Object.fromEntries(s.terms.map((t) => [t.term, t.points]));
    expect(by.relationship).toBe(2); // 77 days − 30 cadence = 47 overdue → 2
    expect(s.dueBy).toBe('2026-09-02'); // week lane, 5 business days
  });
  it('adds promise debt for overdue promises, capped', () => {
    const s = scoreClient(
      client({
        items: [item({ lane: 'week' })],
        overduePromises: 2,
        notes: [{ date: '2026-08-20', channel: 'Call', text: 'x' }],
      }),
      policy,
      CLOCK,
    );
    expect(s.terms.find((t) => t.term === 'relationship')?.points).toBe(2);
    const capped = scoreClient(
      client({
        items: [item({ lane: 'week' })],
        overduePromises: 9,
        notes: [{ date: '2026-08-20', channel: 'Call', text: 'x' }],
      }),
      policy,
      CLOCK,
    );
    expect(capped.terms.find((t) => t.term === 'relationship')?.points).toBe(3);
  });
  it('halves a theme discussed this week unless it escalated', () => {
    const notes = [
      { date: '2026-08-24', channel: 'Call', text: 'Discussed the LTV and collateral top-up' },
    ];
    expect(dampedThemes(notes, policy, CLOCK).has('collateral')).toBe(true);
    const calm = scoreClient(
      client({ items: [item({ theme: 'collateral', lane: 'now', severity: 'high' })], notes }),
      policy,
      CLOCK,
    );
    const escalated = scoreClient(
      client({
        items: [
          item({ theme: 'collateral', lane: 'now', severity: 'high', momentum: 'escalated' }),
        ],
        notes,
      }),
      policy,
      CLOCK,
    );
    expect(calm.priority).toBe(4.5); // 9 × 0.5
    expect(escalated.priority).toBe(10); // 9 + 1, undamped
  });
});

describe('slotFor', () => {
  it('knows the offsets and finds the overlap in RM time', () => {
    expect(tzOffsetHours('Asia/Singapore', CLOCK)).toBe(8);
    expect(tzOffsetHours('Europe/Zurich', CLOCK)).toBe(2);
    expect(slotFor('Asia/Hong_Kong', policy, CLOCK)).toMatchObject({
      rmStart: '09:00',
      rmEnd: '12:00',
      note: 'client morning',
    });
    expect(slotFor('Europe/Zurich', policy, CLOCK)).toMatchObject({
      rmStart: '15:00',
      rmEnd: '18:00',
      note: 'client morning',
    });
    expect(slotFor('America/New_York', policy, CLOCK)).toBeNull();
  });
});

describe('buildEntry and packDays', () => {
  it('spills overflow to the next business day and keeps deferred clients on their day', () => {
    const tight = CallPolicy.parse({
      ...policy,
      capacity: { conversationsPerDay: 2, callMinutes: 30, meetingMinutes: 60 },
    });
    const mk = (
      id: string,
      sev: 'high' | 'medium',
      over: Partial<CallPlanClientInput> = {},
    ): CallPlanClientInput =>
      client({
        clientId: id,
        clientName: id,
        items: [item({ id, lane: 'week', severity: sev })],
        ...over,
      });
    const entries = ['A', 'B', 'C'].map((id, i) =>
      buildEntry(mk(id, i === 0 ? 'high' : 'medium'), { clock: CLOCK, policy: tight }),
    );
    entries.push(
      buildEntry(
        mk('D', 'high', {
          deferral: {
            until: '2026-09-01',
            reason: 'travelling',
            at: 'x',
            madeAtClock: '2026-08-25',
          },
        }),
        { clock: CLOCK, policy: tight },
      ),
    );
    const packed = packDays(entries, CLOCK, tight);
    const byId = Object.fromEntries(packed.map((e) => [e.clientId, e]));
    expect(byId.A?.day).toBe('2026-08-26');
    expect(byId.B?.day).toBe('2026-08-26');
    expect(byId.C?.day).toBe('2026-08-27');
    expect(byId.D?.status).toBe('deferred');
    expect(byId.D?.day).toBe('2026-09-01');
  });
  it('forces a call for a Now collateral item and marks a done client', () => {
    const e = buildEntry(
      client({
        items: [item({ theme: 'collateral', lane: 'now', severity: 'high' })],
        notes: [{ date: '2026-08-01', channel: 'Email', text: 'x' }],
        doneAtClock: CLOCK,
      }),
      { clock: CLOCK, policy },
    );
    expect(e.channel).toBe('call');
    expect(e.status).toBe('done');
  });
});
