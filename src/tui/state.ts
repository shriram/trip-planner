// TUI state model and pure reducers.
//
// This is the view-state for the terminal UI. It wraps the shared, pure
// `Schedule` model (src/model.ts) with cursor/edit/mode information. All
// functions here are pure: given a state they return a new state, never
// touching the terminal or the filesystem. Side effects live in app.ts.

import {
  Schedule,
  ScheduleRow,
  formatDate,
  formatDaytime,
  getDayOfWeek,
  getDaytimeValue,
  getOrDefault
} from '../model.js';

import { checkConstraints, Violation } from '../constraints.js';

// Navigable columns, in left-to-right order.
export const COLUMNS = [
  'date',
  'daytime',
  'night',
  'pinnedEvent',
  'pinnedLocation',
  'attend'
] as const;

export type Column = (typeof COLUMNS)[number];

export interface ColumnMeta {
  readonly header: string;
  readonly width: number;
}

export const COLUMN_META: Record<Column, ColumnMeta> = {
  date: { header: 'Date', width: 10 },
  daytime: { header: 'Daytime', width: 24 },
  night: { header: 'Night', width: 14 },
  pinnedEvent: { header: 'Pinned Event', width: 16 },
  pinnedLocation: { header: 'Location', width: 14 },
  attend: { header: 'Att', width: 3 }
};

// A pending yes/no question produced by a smart-fill behavior. `apply` is a
// pure schedule transform run only if the user confirms. `quit: true` makes a
// "yes" also exit the app (used for the discard-changes-and-quit prompt).
export interface ConfirmRequest {
  question: string;
  apply: (schedule: Schedule) => Schedule;
  quit?: boolean;
}

export type Mode =
  | { kind: 'navigate' }
  | { kind: 'edit'; column: Column; buffer: string }
  | { kind: 'confirm'; request: ConfirmRequest }
  | { kind: 'prompt'; purpose: PromptPurpose; label: string; buffer: string }
  | { kind: 'menu'; menu: MenuKind }
  | { kind: 'import'; buffer: string; error: string | null }
  | { kind: 'help' };

export type PromptPurpose =
  | { kind: 'save' }
  | { kind: 'open' }
  | { kind: 'export'; format: 'md' | 'html' };

export type MenuKind = 'command' | 'export' | 'repair';

export interface TuiState {
  schedule: Schedule;
  violations: Violation[];
  cursorRow: number;
  cursorCol: Column;
  mode: Mode;
  filePath: string | null;
  dirty: boolean;
  status: string;
  quit: boolean;
}

export function initialState(schedule: Schedule, filePath: string | null): TuiState {
  return {
    schedule,
    violations: checkConstraints(schedule),
    cursorRow: 0,
    cursorCol: 'daytime',
    mode: { kind: 'navigate' },
    filePath,
    dirty: false,
    status: '',
    quit: false
  };
}

// Replace the schedule, recompute violations, mark dirty, and clamp the cursor.
export function withSchedule(state: TuiState, schedule: Schedule): TuiState {
  const next: TuiState = {
    ...state,
    schedule,
    violations: checkConstraints(schedule),
    dirty: true
  };
  return clampCursor(next);
}

// Like withSchedule but does not mark dirty (for load/import which are "clean").
export function withCleanSchedule(state: TuiState, schedule: Schedule): TuiState {
  const next: TuiState = {
    ...state,
    schedule,
    violations: checkConstraints(schedule),
    dirty: false
  };
  return clampCursor(next);
}

export function colIndex(col: Column): number {
  return COLUMNS.indexOf(col);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function clampCursor(state: TuiState): TuiState {
  const lastRow = Math.max(0, state.schedule.rows.length - 1);
  return { ...state, cursorRow: clamp(state.cursorRow, 0, lastRow) };
}

// Move the cursor by a delta in rows/columns, clamping to the grid.
export function moveCursor(state: TuiState, dRow: number, dCol: number): TuiState {
  const lastRow = Math.max(0, state.schedule.rows.length - 1);
  const cursorRow = clamp(state.cursorRow + dRow, 0, lastRow);
  const ci = clamp(colIndex(state.cursorCol) + dCol, 0, COLUMNS.length - 1);
  return { ...state, cursorRow, cursorCol: COLUMNS[ci], status: '' };
}

export function setCursor(state: TuiState, row: number, col: Column): TuiState {
  const lastRow = Math.max(0, state.schedule.rows.length - 1);
  return { ...state, cursorRow: clamp(row, 0, lastRow), cursorCol: col };
}

export function currentRow(state: TuiState): ScheduleRow | undefined {
  return state.schedule.rows[state.cursorRow];
}

// The string a cell shows in navigate mode.
export function cellDisplay(row: ScheduleRow, col: Column): string {
  switch (col) {
    case 'date':
      return formatDate(row.date);
    case 'daytime':
      return formatDaytime(getDaytimeValue(row.daytime));
    case 'night':
      return getOrDefault(row.night, '');
    case 'pinnedEvent':
      return formatDaytime(getDaytimeValue(row.otherEvent));
    case 'pinnedLocation':
      return getOrDefault(row.otherLocation, '');
    case 'attend':
      return row.attend ? '✓' : '';
  }
}

// The day-of-week label rendered alongside the date (non-navigable).
export function dayLabel(row: ScheduleRow): string {
  return getDayOfWeek(row.date);
}
