import { describe, expect, it } from 'vitest';
import { dueDateIn, extractPromises, splitSentences } from './extract.js';

describe('dueDateIn', () => {
  it('reads absolute and relative dates from a sentence', () => {
    expect(dueDateIn('needs SGD 9m for the deposit in early 2027', '2026-04-14')).toBe(
      '2027-02-28',
    );
    expect(dueDateIn('equity contribution by mid-2027', '2026-08-11')).toBe('2027-06-30');
    expect(dueDateIn('bankers indicate Q4 2026', '2026-02-03')).toBe('2026-10-01');
    expect(dueDateIn('he will top up by Friday', '2026-08-26')).toBe('2026-08-28');
    expect(dueDateIn('revert next week', '2026-08-26')).toBe('2026-09-02');
    expect(dueDateIn('starts at a UK university in September 2027', '2026-03-01')).toBe(
      '2027-09-01',
    );
    expect(dueDateIn('nothing dated here', '2026-08-26')).toBeNull();
  });
});

describe('extractPromises', () => {
  it('splits sentences and keeps the quote verbatim', () => {
    expect(splitSentences('First one. Second one? Third.')).toEqual([
      'First one.',
      'Second one?',
      'Third.',
    ]);
  });
  it('finds RM promises with the RM as party', () => {
    const c = extractPromises(
      'Client called about the energy rally. I will send him the yield ideas next week. He was pleased.',
      '2026-04-14',
    );
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ party: 'rm', kind: 'promise', dueDate: '2026-04-21' });
    expect(c[0]?.quote).toBe('I will send him the yield ideas next week.');
  });
  it('finds client promises', () => {
    const c = extractPromises(
      'Discussed the facility. He agreed to top up collateral by Friday.',
      '2026-08-26',
    );
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ party: 'client', dueDate: '2026-08-28' });
  });
  it('flags decision debt', () => {
    const c = extractPromises(
      'Second attempt at a deployment plan. Client agreed the allocation in principle in October 2024 and again in June 2025 but has not executed.',
      '2026-05-01',
    );
    expect(c.some((x) => x.kind === 'decision-debt')).toBe(true);
  });
  it('ignores sentences without a commitment', () => {
    expect(
      extractPromises(
        'Annual review in Singapore. Client is more engaged than in prior years.',
        '2026-01-08',
      ),
    ).toHaveLength(0);
  });
});
