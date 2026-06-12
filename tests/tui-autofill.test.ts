import { describe, it, expect } from 'vitest';
import {
  Schedule,
  createEmptySchedule,
  addRowToSchedule,
  createRow,
  parseDate,
  some,
  none,
  isSome,
  getOrDefault,
  DaytimeType
} from '../src/model.js';
import { applyDaytimeChange } from '../src/tui/autofill.js';

function twoRowSchedule(prevNight: string | null): Schedule {
  let s = createEmptySchedule();
  const d0 = parseDate('2026-06-11')!;
  const d1 = parseDate('2026-06-12')!;
  s = addRowToSchedule(s, createRow(d0, { night: prevNight ? some(prevNight) : none() }));
  s = addRowToSchedule(s, createRow(d1));
  return s;
}

const travel = (from: string, to: string): DaytimeType => ({ kind: 'travel', from, to });
const personal: DaytimeType = { kind: 'personal' };
const org = (name: string): DaytimeType => ({ kind: 'organization', name });

describe('applyDaytimeChange — travel', () => {
  it('auto-fills an empty Night with the destination', () => {
    const s = twoRowSchedule(null);
    const rowId = s.rows[1].id;
    const { schedule, confirm } = applyDaytimeChange(s, rowId, travel('London', 'Paris'));
    expect(confirm).toBeNull();
    expect(getOrDefault(schedule.rows[1].night, '')).toBe('Paris');
  });

  it('asks (confirm) before overwriting a differing Night', () => {
    let s = twoRowSchedule(null);
    s.rows[1] = { ...s.rows[1], night: some('Berlin') };
    const rowId = s.rows[1].id;
    const { schedule, confirm } = applyDaytimeChange(s, rowId, travel('London', 'Paris'));
    expect(confirm).not.toBeNull();
    // Base change leaves the night untouched until confirmed.
    expect(getOrDefault(schedule.rows[1].night, '')).toBe('Berlin');
    const after = confirm!.apply(schedule);
    expect(getOrDefault(after.rows[1].night, '')).toBe('Paris');
  });

  it('does not ask when Night already equals the destination', () => {
    let s = twoRowSchedule(null);
    s.rows[1] = { ...s.rows[1], night: some('Paris') };
    const { confirm } = applyDaytimeChange(s, s.rows[1].id, travel('London', 'Paris'));
    expect(confirm).toBeNull();
  });
});

describe('applyDaytimeChange — non-travel', () => {
  it('inherits the previous Night when empty', () => {
    const s = twoRowSchedule('London');
    const { schedule, confirm } = applyDaytimeChange(s, s.rows[1].id, org('Acme Corp'));
    expect(confirm).toBeNull();
    expect(getOrDefault(schedule.rows[1].night, '')).toBe('London');
  });

  it('personal day between different locations offers to match previous night', () => {
    let s = twoRowSchedule('London');
    s.rows[1] = { ...s.rows[1], night: some('Paris') };
    const { schedule, confirm } = applyDaytimeChange(s, s.rows[1].id, personal);
    expect(confirm).not.toBeNull();
    expect(getOrDefault(schedule.rows[1].night, '')).toBe('Paris'); // unchanged until confirmed
    const after = confirm!.apply(schedule);
    expect(getOrDefault(after.rows[1].night, '')).toBe('London');
  });

  it('personal day inheriting prev night produces no confirm', () => {
    const s = twoRowSchedule('London'); // row 1 night empty -> inherits London
    const { confirm } = applyDaytimeChange(s, s.rows[1].id, personal);
    expect(confirm).toBeNull();
  });

  it('sets the daytime value regardless', () => {
    const s = twoRowSchedule('London');
    const { schedule } = applyDaytimeChange(s, s.rows[1].id, org('Acme Corp'));
    expect(isSome(schedule.rows[1].daytime)).toBe(true);
  });
});
