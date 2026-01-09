// Core data types for trip planner

export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

// Option type to distinguish "not set" from "set to value"
export type Option<T> = { set: false } | { set: true; value: T };

export function none<T>(): Option<T> {
  return { set: false };
}

export function some<T>(value: T): Option<T> {
  return { set: true, value };
}

export function isNone<T>(opt: Option<T>): opt is { set: false } {
  return !opt.set;
}

export function isSome<T>(opt: Option<T>): opt is { set: true; value: T } {
  return opt.set;
}

export function getOrDefault<T>(opt: Option<T>, defaultValue: T): T {
  return opt.set ? opt.value : defaultValue;
}

export type DaytimeType =
  | { kind: 'travel'; from: string; to: string }
  | { kind: 'organization'; name: string }
  | { kind: 'personal' }
  | { kind: 'empty' };

export interface ScheduleRow {
  id: string;
  date: Date;
  daytime: Option<DaytimeType>;
  night: Option<string>;
  otherEvent: Option<DaytimeType>;
  otherLocation: Option<string>;
  attend: boolean;
}

export interface Schedule {
  rows: ScheduleRow[];
}

// Date utilities

const DAY_NAMES: readonly DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getDayOfWeek(date: Date): DayOfWeek {
  return DAY_NAMES[date.getDay()];
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isValidYear(date: Date): boolean {
  const year = date.getFullYear();
  return year > 2000 && year < 2100;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function nextMonday(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  result.setDate(result.getDate() + daysUntilMonday);
  return result;
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDate(str: string): Date | null {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  if (!isValidYear(date)) return null;
  return date;
}

// Daytime parsing and formatting

const TRAVEL_ARROW_REGEX = /^(.+?)\s*(?:-->|->|→|⭢)\s*(.+)$/;

export function parseDaytime(str: string): DaytimeType {
  const trimmed = str.trim();
  if (trimmed === '') return { kind: 'empty' };
  if (trimmed.toLowerCase() === 'personal') return { kind: 'personal' };

  const travelMatch = trimmed.match(TRAVEL_ARROW_REGEX);
  if (travelMatch) {
    return { kind: 'travel', from: travelMatch[1].trim(), to: travelMatch[2].trim() };
  }

  return { kind: 'organization', name: trimmed };
}

export function formatDaytime(daytime: DaytimeType): string {
  switch (daytime.kind) {
    case 'empty': return '';
    case 'personal': return 'personal';
    case 'travel': return `${daytime.from} → ${daytime.to}`;
    case 'organization': return daytime.name;
  }
}

export function isOrganization(daytime: Option<DaytimeType>): boolean {
  return isSome(daytime) && daytime.value.kind === 'organization';
}

export function isTravel(daytime: Option<DaytimeType>): boolean {
  return isSome(daytime) && daytime.value.kind === 'travel';
}

export function isPersonal(daytime: Option<DaytimeType>): boolean {
  return isSome(daytime) && daytime.value.kind === 'personal';
}

export function isEmpty(daytime: Option<DaytimeType>): boolean {
  return isNone(daytime) || daytime.value.kind === 'empty';
}

export function getDaytimeValue(daytime: Option<DaytimeType>): DaytimeType {
  return isSome(daytime) ? daytime.value : { kind: 'empty' };
}

// Row operations

let idCounter = 0;

export function generateId(): string {
  return `row-${Date.now()}-${idCounter++}`;
}

export function createRow(date: Date, overrides?: Partial<Omit<ScheduleRow, 'id' | 'date'>>): ScheduleRow {
  return {
    id: generateId(),
    date,
    daytime: none(),
    night: none(),
    otherEvent: none(),
    otherLocation: none(),
    attend: false,
    ...overrides
  };
}

export function createEmptySchedule(): Schedule {
  return { rows: [] };
}

export function addRowToSchedule(schedule: Schedule, row: ScheduleRow): Schedule {
  return { rows: [...schedule.rows, row] };
}

export function removeRowFromSchedule(schedule: Schedule, rowId: string): Schedule {
  return { rows: schedule.rows.filter(r => r.id !== rowId) };
}

export function updateRowInSchedule(
  schedule: Schedule,
  rowId: string,
  updates: Partial<Omit<ScheduleRow, 'id'>>
): Schedule {
  return {
    rows: schedule.rows.map(r =>
      r.id === rowId ? { ...r, ...updates } : r
    )
  };
}

export function insertRowAtIndex(schedule: Schedule, index: number, row: ScheduleRow): Schedule {
  const newRows = [...schedule.rows];
  newRows.splice(index, 0, row);
  return { rows: newRows };
}

export function getRowByIndex(schedule: Schedule, index: number): ScheduleRow | undefined {
  return schedule.rows[index];
}

export function getRowById(schedule: Schedule, id: string): ScheduleRow | undefined {
  return schedule.rows.find(r => r.id === id);
}

export function getRowIndex(schedule: Schedule, id: string): number {
  return schedule.rows.findIndex(r => r.id === id);
}

// Auto-populate dates for rows after the first
export function autoPopulateDates(schedule: Schedule): Schedule {
  if (schedule.rows.length === 0) return schedule;

  const firstRow = schedule.rows[0];
  return {
    rows: schedule.rows.map((row, index) => ({
      ...row,
      date: addDays(firstRow.date, index)
    }))
  };
}

// Serialization for Copy/Paste

interface SerializedDaytime {
  kind: 'travel' | 'organization' | 'personal' | 'empty';
  from?: string;
  to?: string;
  name?: string;
}

interface SerializedOption<T> {
  set: boolean;
  value?: T;
}

interface SerializedRow {
  date: string;
  daytime: SerializedOption<SerializedDaytime>;
  night: SerializedOption<string>;
  otherEvent: SerializedOption<SerializedDaytime>;
  otherLocation: SerializedOption<string>;
  attend: boolean;
}

interface SerializedSchedule {
  version: 1;
  rows: SerializedRow[];
}

function serializeDaytime(daytime: DaytimeType): SerializedDaytime {
  switch (daytime.kind) {
    case 'empty': return { kind: 'empty' };
    case 'personal': return { kind: 'personal' };
    case 'travel': return { kind: 'travel', from: daytime.from, to: daytime.to };
    case 'organization': return { kind: 'organization', name: daytime.name };
  }
}

function deserializeDaytime(data: SerializedDaytime): DaytimeType {
  switch (data.kind) {
    case 'empty': return { kind: 'empty' };
    case 'personal': return { kind: 'personal' };
    case 'travel': return { kind: 'travel', from: data.from ?? '', to: data.to ?? '' };
    case 'organization': return { kind: 'organization', name: data.name ?? '' };
  }
}

function serializeOption<T, S>(opt: Option<T>, serialize: (v: T) => S): SerializedOption<S> {
  if (isNone(opt)) return { set: false };
  return { set: true, value: serialize(opt.value) };
}

function deserializeOption<T, S>(data: SerializedOption<S>, deserialize: (v: S) => T): Option<T> {
  if (!data.set || data.value === undefined) return none();
  return some(deserialize(data.value));
}

export function serializeSchedule(schedule: Schedule): string {
  const data: SerializedSchedule = {
    version: 1,
    rows: schedule.rows.map(row => ({
      date: formatDate(row.date),
      daytime: serializeOption(row.daytime, serializeDaytime),
      night: serializeOption(row.night, v => v),
      otherEvent: serializeOption(row.otherEvent, serializeDaytime),
      otherLocation: serializeOption(row.otherLocation, v => v),
      attend: row.attend
    }))
  };
  return JSON.stringify(data, null, 2);
}

export function deserializeSchedule(json: string): Schedule | null {
  try {
    const data = JSON.parse(json) as SerializedSchedule;
    if (data.version !== 1) return null;

    const rows: ScheduleRow[] = data.rows.map(row => {
      const date = parseDate(row.date);
      if (!date) throw new Error(`Invalid date: ${row.date}`);
      return {
        id: generateId(),
        date,
        daytime: deserializeOption(row.daytime, deserializeDaytime),
        night: deserializeOption(row.night, v => v),
        otherEvent: deserializeOption(row.otherEvent, deserializeDaytime),
        otherLocation: deserializeOption(row.otherLocation, v => v),
        attend: row.attend
      };
    });

    return { rows };
  } catch {
    return null;
  }
}

// Pretty print for email

export function prettyPrintSchedule(schedule: Schedule): string {
  if (schedule.rows.length === 0) {
    return '<p><em>No schedule data</em></p>';
  }

  let html = '<table style="border-collapse: collapse; font-family: sans-serif; font-size: 13px;">';
  html += '<thead><tr style="background: #f0f0f0;">';
  html += '<th style="border: 1px solid #ccc; padding: 6px;">Date</th>';
  html += '<th style="border: 1px solid #ccc; padding: 6px;">Day</th>';
  html += '<th style="border: 1px solid #ccc; padding: 6px;">Daytime</th>';
  html += '<th style="border: 1px solid #ccc; padding: 6px;">Night</th>';
  html += '</tr></thead><tbody>';

  for (const row of schedule.rows) {
    const day = getDayOfWeek(row.date);
    const isWknd = isWeekend(row.date);
    const bgColor = isWknd ? '#f9f9f9' : '#fff';
    const daytimeValue = getDaytimeValue(row.daytime);

    const nightValue = getOrDefault(row.night, '');

    html += `<tr style="background: ${bgColor};">`;
    html += `<td style="border: 1px solid #ccc; padding: 6px;">${formatDate(row.date)}</td>`;
    html += `<td style="border: 1px solid #ccc; padding: 6px;">${day}</td>`;
    html += `<td style="border: 1px solid #ccc; padding: 6px;">${formatDaytime(daytimeValue)}</td>`;
    html += `<td style="border: 1px solid #ccc; padding: 6px;">${nightValue}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}
