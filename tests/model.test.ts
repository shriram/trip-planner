import { describe, it, expect } from 'vitest';
import {
  getDayOfWeek,
  isWeekend,
  isValidYear,
  addDays,
  nextMonday,
  formatDate,
  parseDate,
  parseDaytime,
  formatDaytime,
  createRow,
  addRowToSchedule,
  removeRowFromSchedule,
  updateRowInSchedule,
  createEmptySchedule,
  serializeSchedule,
  deserializeSchedule,
  autoPopulateDates,
  some,
  none,
  isSome,
  isNone,
  getOrDefault
} from '../src/model.js';

describe('Option type utilities', () => {
  it('some creates a set option', () => {
    const opt = some('hello');
    expect(isSome(opt)).toBe(true);
    expect(isNone(opt)).toBe(false);
    if (isSome(opt)) {
      expect(opt.value).toBe('hello');
    }
  });

  it('none creates an unset option', () => {
    const opt = none<string>();
    expect(isNone(opt)).toBe(true);
    expect(isSome(opt)).toBe(false);
  });

  it('getOrDefault returns value or default', () => {
    expect(getOrDefault(some('hello'), 'default')).toBe('hello');
    expect(getOrDefault(none(), 'default')).toBe('default');
  });
});

describe('Date utilities', () => {
  it('getDayOfWeek returns correct day', () => {
    // January 1, 2024 was a Monday
    expect(getDayOfWeek(new Date(2024, 0, 1))).toBe('Mon');
    expect(getDayOfWeek(new Date(2024, 0, 2))).toBe('Tue');
    expect(getDayOfWeek(new Date(2024, 0, 6))).toBe('Sat');
    expect(getDayOfWeek(new Date(2024, 0, 7))).toBe('Sun');
  });

  it('isWeekend detects weekends', () => {
    expect(isWeekend(new Date(2024, 0, 1))).toBe(false); // Monday
    expect(isWeekend(new Date(2024, 0, 5))).toBe(false); // Friday
    expect(isWeekend(new Date(2024, 0, 6))).toBe(true);  // Saturday
    expect(isWeekend(new Date(2024, 0, 7))).toBe(true);  // Sunday
  });

  it('isValidYear validates year range', () => {
    expect(isValidYear(new Date(2000, 0, 1))).toBe(false);
    expect(isValidYear(new Date(2001, 0, 1))).toBe(true);
    expect(isValidYear(new Date(2099, 0, 1))).toBe(true);
    expect(isValidYear(new Date(2100, 0, 1))).toBe(false);
  });

  it('addDays adds days correctly', () => {
    const date = new Date(2024, 0, 15);
    expect(formatDate(addDays(date, 1))).toBe('2024-01-16');
    expect(formatDate(addDays(date, 7))).toBe('2024-01-22');
    expect(formatDate(addDays(date, -5))).toBe('2024-01-10');
  });

  it('addDays handles month boundaries', () => {
    expect(formatDate(addDays(new Date(2024, 0, 31), 1))).toBe('2024-02-01');
    expect(formatDate(addDays(new Date(2024, 1, 29), 1))).toBe('2024-03-01'); // Leap year
  });

  it('nextMonday finds next Monday', () => {
    // From a Wednesday
    expect(getDayOfWeek(nextMonday(new Date(2024, 0, 3)))).toBe('Mon');
    expect(formatDate(nextMonday(new Date(2024, 0, 3)))).toBe('2024-01-08');

    // From a Saturday
    expect(formatDate(nextMonday(new Date(2024, 0, 6)))).toBe('2024-01-08');

    // From a Sunday
    expect(formatDate(nextMonday(new Date(2024, 0, 7)))).toBe('2024-01-08');
  });

  it('formatDate produces ISO format', () => {
    expect(formatDate(new Date(2024, 0, 1))).toBe('2024-01-01');
    expect(formatDate(new Date(2024, 11, 31))).toBe('2024-12-31');
  });

  it('parseDate parses ISO format', () => {
    const date = parseDate('2024-03-15');
    expect(date).not.toBeNull();
    expect(formatDate(date!)).toBe('2024-03-15');
  });

  it('parseDate rejects invalid dates', () => {
    expect(parseDate('invalid')).toBeNull();
    expect(parseDate('2024/03/15')).toBeNull();
    expect(parseDate('1999-01-01')).toBeNull(); // Before 2001
    expect(parseDate('2100-01-01')).toBeNull(); // After 2099
  });
});

describe('Daytime parsing', () => {
  it('parses empty string', () => {
    expect(parseDaytime('')).toEqual({ kind: 'empty' });
    expect(parseDaytime('   ')).toEqual({ kind: 'empty' });
  });

  it('parses personal', () => {
    expect(parseDaytime('personal')).toEqual({ kind: 'personal' });
    expect(parseDaytime('Personal')).toEqual({ kind: 'personal' });
    expect(parseDaytime('PERSONAL')).toEqual({ kind: 'personal' });
  });

  it('parses travel with various arrows', () => {
    expect(parseDaytime('Boston --> NYC')).toEqual({ kind: 'travel', from: 'Boston', to: 'NYC' });
    expect(parseDaytime('Boston -> NYC')).toEqual({ kind: 'travel', from: 'Boston', to: 'NYC' });
    expect(parseDaytime('Boston ⭢ NYC')).toEqual({ kind: 'travel', from: 'Boston', to: 'NYC' });
    expect(parseDaytime('Boston → NYC')).toEqual({ kind: 'travel', from: 'Boston', to: 'NYC' });
  });

  it('parses organization names', () => {
    expect(parseDaytime('MIT')).toEqual({ kind: 'organization', name: 'MIT' });
    expect(parseDaytime('Google HQ')).toEqual({ kind: 'organization', name: 'Google HQ' });
  });

  it('formatDaytime formats correctly', () => {
    expect(formatDaytime({ kind: 'empty' })).toBe('');
    expect(formatDaytime({ kind: 'personal' })).toBe('personal');
    expect(formatDaytime({ kind: 'travel', from: 'A', to: 'B' })).toBe('A → B');
    expect(formatDaytime({ kind: 'organization', name: 'MIT' })).toBe('MIT');
  });
});

describe('Schedule operations', () => {
  it('creates empty schedule', () => {
    const schedule = createEmptySchedule();
    expect(schedule.rows).toEqual([]);
  });

  it('creates row with defaults', () => {
    const date = new Date(2024, 0, 15);
    const row = createRow(date);
    expect(row.date).toEqual(date);
    expect(isNone(row.daytime)).toBe(true);
    expect(isNone(row.night)).toBe(true);
    expect(row.attend).toBe(false);
  });

  it('creates row with overrides', () => {
    const date = new Date(2024, 0, 15);
    const row = createRow(date, { night: some('Boston'), attend: true });
    expect(isSome(row.night)).toBe(true);
    if (isSome(row.night)) {
      expect(row.night.value).toBe('Boston');
    }
    expect(row.attend).toBe(true);
  });

  it('adds row to schedule', () => {
    let schedule = createEmptySchedule();
    const row = createRow(new Date(2024, 0, 15));
    schedule = addRowToSchedule(schedule, row);
    expect(schedule.rows.length).toBe(1);
    expect(schedule.rows[0]).toEqual(row);
  });

  it('removes row from schedule', () => {
    let schedule = createEmptySchedule();
    const row1 = createRow(new Date(2024, 0, 15));
    const row2 = createRow(new Date(2024, 0, 16));
    schedule = addRowToSchedule(schedule, row1);
    schedule = addRowToSchedule(schedule, row2);
    schedule = removeRowFromSchedule(schedule, row1.id);
    expect(schedule.rows.length).toBe(1);
    expect(schedule.rows[0].id).toBe(row2.id);
  });

  it('updates row in schedule', () => {
    let schedule = createEmptySchedule();
    const row = createRow(new Date(2024, 0, 15));
    schedule = addRowToSchedule(schedule, row);
    schedule = updateRowInSchedule(schedule, row.id, { night: some('NYC') });
    expect(isSome(schedule.rows[0].night)).toBe(true);
    if (isSome(schedule.rows[0].night)) {
      expect(schedule.rows[0].night.value).toBe('NYC');
    }
  });

  it('auto-populates dates', () => {
    const baseDate = new Date(2024, 0, 15);
    let schedule = createEmptySchedule();
    schedule = addRowToSchedule(schedule, createRow(baseDate));
    schedule = addRowToSchedule(schedule, createRow(baseDate)); // Same date initially
    schedule = addRowToSchedule(schedule, createRow(baseDate));
    schedule = autoPopulateDates(schedule);

    expect(formatDate(schedule.rows[0].date)).toBe('2024-01-15');
    expect(formatDate(schedule.rows[1].date)).toBe('2024-01-16');
    expect(formatDate(schedule.rows[2].date)).toBe('2024-01-17');
  });
});

describe('Serialization', () => {
  it('round-trips schedule through JSON', () => {
    let schedule = createEmptySchedule();
    const row1 = createRow(new Date(2024, 0, 15), {
      daytime: some({ kind: 'organization', name: 'MIT' }),
      night: some('Boston'),
      otherEvent: some({ kind: 'personal' }),
      otherLocation: some('Cambridge'),
      attend: true
    });
    const row2 = createRow(new Date(2024, 0, 16), {
      daytime: some({ kind: 'travel', from: 'Boston', to: 'NYC' }),
      night: some('NYC')
    });
    schedule = addRowToSchedule(schedule, row1);
    schedule = addRowToSchedule(schedule, row2);

    const json = serializeSchedule(schedule);
    const restored = deserializeSchedule(json);

    expect(restored).not.toBeNull();
    expect(restored!.rows.length).toBe(2);
    expect(formatDate(restored!.rows[0].date)).toBe('2024-01-15');

    const restoredRow0 = restored!.rows[0];
    expect(isSome(restoredRow0.daytime)).toBe(true);
    if (isSome(restoredRow0.daytime)) {
      expect(restoredRow0.daytime.value).toEqual({ kind: 'organization', name: 'MIT' });
    }
    expect(isSome(restoredRow0.night)).toBe(true);
    if (isSome(restoredRow0.night)) {
      expect(restoredRow0.night.value).toBe('Boston');
    }
    expect(restoredRow0.attend).toBe(true);

    const restoredRow1 = restored!.rows[1];
    expect(isSome(restoredRow1.daytime)).toBe(true);
    if (isSome(restoredRow1.daytime)) {
      expect(restoredRow1.daytime.value).toEqual({ kind: 'travel', from: 'Boston', to: 'NYC' });
    }
  });

  it('handles unset options in serialization', () => {
    let schedule = createEmptySchedule();
    const row = createRow(new Date(2024, 0, 15)); // All options unset
    schedule = addRowToSchedule(schedule, row);

    const json = serializeSchedule(schedule);
    const restored = deserializeSchedule(json);

    expect(restored).not.toBeNull();
    const restoredRow = restored!.rows[0];
    expect(isNone(restoredRow.daytime)).toBe(true);
    expect(isNone(restoredRow.night)).toBe(true);
    expect(isNone(restoredRow.otherEvent)).toBe(true);
    expect(isNone(restoredRow.otherLocation)).toBe(true);
  });

  it('rejects invalid JSON', () => {
    expect(deserializeSchedule('not json')).toBeNull();
    expect(deserializeSchedule('{"version": 2}')).toBeNull();
  });
});
