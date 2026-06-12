import { describe, it, expect } from 'vitest';
import {
  Schedule,
  createEmptySchedule,
  addRowToSchedule,
  createRow,
  parseDate,
  some
} from '../src/model.js';
import {
  initialState,
  moveCursor,
  setCursor,
  withSchedule,
  cellDisplay,
  dayLabel,
  COLUMNS
} from '../src/tui/state.js';

function schedule(n: number): Schedule {
  let s = createEmptySchedule();
  const start = parseDate('2026-06-11')!; // a Thursday
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    s = addRowToSchedule(s, createRow(d));
  }
  return s;
}

describe('cursor movement', () => {
  it('clamps row movement to the grid', () => {
    const st = initialState(schedule(3), null);
    expect(moveCursor(st, -5, 0).cursorRow).toBe(0);
    expect(moveCursor(st, 99, 0).cursorRow).toBe(2);
  });

  it('clamps column movement to the defined columns', () => {
    const st = initialState(schedule(3), null);
    const left = moveCursor(st, 0, -99);
    expect(left.cursorCol).toBe(COLUMNS[0]);
    const right = moveCursor(st, 0, 99);
    expect(right.cursorCol).toBe(COLUMNS[COLUMNS.length - 1]);
  });

  it('setCursor clamps the row', () => {
    const st = initialState(schedule(2), null);
    expect(setCursor(st, 100, 'night').cursorRow).toBe(1);
    expect(setCursor(st, 100, 'night').cursorCol).toBe('night');
  });
});

describe('cellDisplay', () => {
  it('renders each column', () => {
    let s = createEmptySchedule();
    const row = createRow(parseDate('2026-06-13')!, {
      daytime: some({ kind: 'travel', from: 'A', to: 'B' }),
      night: some('B'),
      otherEvent: some({ kind: 'organization', name: 'Gig' }),
      otherLocation: some('B'),
      attend: true
    });
    s = addRowToSchedule(s, row);
    expect(cellDisplay(row, 'date')).toBe('2026-06-13');
    expect(cellDisplay(row, 'daytime')).toBe('A → B');
    expect(cellDisplay(row, 'night')).toBe('B');
    expect(cellDisplay(row, 'pinnedEvent')).toBe('Gig');
    expect(cellDisplay(row, 'pinnedLocation')).toBe('B');
    expect(cellDisplay(row, 'attend')).toBe('✓');
    expect(dayLabel(row)).toBe('Sat');
  });
});

describe('withSchedule', () => {
  it('marks dirty and recomputes violations', () => {
    const st = initialState(schedule(2), null);
    expect(st.dirty).toBe(false);
    // Put an organization on a weekend (2026-06-13 is Sat) to force a violation.
    let s = st.schedule;
    s = { ...s, rows: s.rows.map((r, i) => (i === 1 ? { ...r, date: parseDate('2026-06-13')!, daytime: some({ kind: 'organization', name: 'X' } as const) } : r)) };
    const next = withSchedule(st, s);
    expect(next.dirty).toBe(true);
    expect(next.violations.length).toBeGreaterThan(0);
  });
});
