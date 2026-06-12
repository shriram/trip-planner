// Pure renderer: TuiState -> array of screen lines.
//
// No terminal I/O happens here. `renderScreen` returns the lines to draw; the
// app shell positions the cursor and writes them. ANSI styling is optional so
// the renderer can be exercised in plain text by tests.

import { isWeekend, isPersonal, isTravel } from '../model.js';
import { rowHasViolation, suggestRepairs, RepairSuggestion } from '../constraints.js';
import {
  TuiState,
  Column,
  COLUMNS,
  COLUMN_META,
  cellDisplay,
  dayLabel
} from './state.js';

// --- ANSI ---------------------------------------------------------------
const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const REVERSE = `${ESC}7m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const UNDERLINE = `${ESC}4m`;
const CYAN = `${ESC}36m`;
const YELLOW = `${ESC}33m`;
const RED = `${ESC}31m`;
const GREEN = `${ESC}32m`;

// --- text helpers (count by code point, not UTF-16 unit) ----------------
function len(s: string): number {
  return Array.from(s).length;
}

function truncate(s: string, width: number): string {
  const chars = Array.from(s);
  if (chars.length <= width) return s;
  if (width <= 1) return chars.slice(0, width).join('');
  return chars.slice(0, width - 1).join('') + '…';
}

type Align = 'left' | 'center';

function pad(s: string, width: number, align: Align = 'left'): string {
  const t = truncate(s, width);
  const gap = width - len(t);
  if (gap <= 0) return t;
  if (align === 'center') {
    const left = Math.floor(gap / 2);
    return ' '.repeat(left) + t + ' '.repeat(gap - left);
  }
  return t + ' '.repeat(gap);
}

// Render columns include the non-navigable day-of-week pseudo-column.
interface RenderCol {
  key: Column | '__day';
  width: number;
  header: string;
  align: Align;
}

const RENDER_COLS: RenderCol[] = [
  { key: 'date', width: COLUMN_META.date.width, header: COLUMN_META.date.header, align: 'left' },
  { key: '__day', width: 3, header: 'Day', align: 'left' },
  { key: 'daytime', width: COLUMN_META.daytime.width, header: COLUMN_META.daytime.header, align: 'left' },
  { key: 'night', width: COLUMN_META.night.width, header: COLUMN_META.night.header, align: 'left' },
  { key: 'pinnedEvent', width: COLUMN_META.pinnedEvent.width, header: COLUMN_META.pinnedEvent.header, align: 'left' },
  { key: 'pinnedLocation', width: COLUMN_META.pinnedLocation.width, header: COLUMN_META.pinnedLocation.header, align: 'left' },
  { key: 'attend', width: COLUMN_META.attend.width, header: COLUMN_META.attend.header, align: 'center' }
];

const GUTTER = 2;

export interface RenderOptions {
  color: boolean;
  width: number;
  height: number;
}

export const defaultRenderOptions: RenderOptions = { color: true, width: 100, height: 40 };

function tint(text: string, code: string, color: boolean): string {
  return color ? code + text + RESET : text;
}

function headerLine(color: boolean): string {
  const cells = RENDER_COLS.map((c) => pad(c.header, c.width, c.align));
  const line = ' '.repeat(GUTTER) + cells.join(' ');
  return tint(line, BOLD + UNDERLINE, color);
}

// Build one data row's line, applying row-type tint and the cursor highlight.
function rowLine(state: TuiState, rowIndex: number, opts: RenderOptions): string {
  const row = state.schedule.rows[rowIndex];
  const editing =
    state.mode.kind === 'edit' && rowIndex === state.cursorRow ? state.mode : null;

  const weekend = isWeekend(row.date);
  const violation = rowHasViolation(state.violations, row.id);
  const rowColor = isPersonal(row.daytime) ? CYAN : isTravel(row.daytime) ? YELLOW : '';

  const cells = RENDER_COLS.map((c) => {
    const raw =
      c.key === '__day'
        ? dayLabel(row)
        : editing && c.key === editing.column
          ? editing.buffer
          : cellDisplay(row, c.key);
    const text = pad(raw, c.width, c.align);

    if (!opts.color) return text;

    const isCursorCell = rowIndex === state.cursorRow && c.key === state.cursorCol;
    if (editing && c.key === editing.column) return tint(text, REVERSE + GREEN, true);
    if (isCursorCell) return tint(text, REVERSE, true);
    if ((c.key === 'date' || c.key === '__day') && weekend) {
      return tint(text, DIM + (rowColor || ''), true);
    }
    if (rowColor) return tint(text, rowColor, true);
    return text;
  });

  const cursorRowHere = rowIndex === state.cursorRow;
  const gutterMark = violation ? (opts.color ? tint('!', RED + BOLD, true) : '!') : ' ';
  const gutter = (cursorRowHere ? '>' : ' ') + gutterMark;

  return gutter + cells.join(' ');
}

function violationBlock(state: TuiState, opts: RenderOptions, maxLines: number): string[] {
  if (state.violations.length === 0) return [];
  const out: string[] = [];
  out.push(tint(`Violations (${state.violations.length}):`, RED + BOLD, opts.color));
  const shown = state.violations.slice(0, Math.max(0, maxLines - 1));
  for (const v of shown) {
    out.push(tint('  • ' + truncate(v.message, opts.width - 4), RED, opts.color));
  }
  if (state.violations.length > shown.length) {
    out.push(tint(`  … and ${state.violations.length - shown.length} more`, RED, opts.color));
  }
  return out;
}

const NAV_HINT =
  'Type to edit · ↑↓←→/Tab move · Enter edit-in-place · Space toggle Attend · ^K commands · ^C quit';

// The bottom interaction line(s), depending on mode.
function modeLines(state: TuiState, opts: RenderOptions): string[] {
  switch (state.mode.kind) {
    case 'navigate': {
      const text = state.status || NAV_HINT;
      return [tint(truncate(text, opts.width), DIM, opts.color)];
    }
    case 'edit':
      return [
        tint(
          `Editing ${state.mode.column} — Enter/Tab: commit · Esc: cancel`,
          BOLD,
          opts.color
        )
      ];
    case 'confirm':
      return [tint('? ' + state.mode.request.question + '  (y/n)', YELLOW + BOLD, opts.color)];
    case 'prompt':
      return [tint(`${state.mode.label}: ${state.mode.buffer}▏`, BOLD, opts.color)];
    case 'menu':
      return menuLines(state, opts);
    case 'import': {
      const lines = [
        tint(
          'Import — paste schedule JSON (⌘V) to replace the current schedule · Enter: apply · Esc: cancel',
          BOLD,
          opts.color
        )
      ];
      const chars = Array.from(state.mode.buffer).length;
      if (chars > 0) lines.push(tint(`  ${chars} characters buffered`, DIM, opts.color));
      if (state.mode.error) lines.push(tint('  ' + state.mode.error, RED, opts.color));
      return lines;
    }
    case 'help':
      return []; // help renders as a full overlay instead
  }
}

function menuLines(state: TuiState, opts: RenderOptions): string[] {
  if (state.mode.kind !== 'menu') return [];
  if (state.mode.menu === 'command') {
    return [
      tint('Command:', BOLD, opts.color),
      tint(
        '  a add below · A add above · x delete · g/G top/bottom · r repair · i import · e export',
        opts.color ? CYAN : '',
        opts.color
      ),
      tint(
        '  s save · S save-as · o open · c copy JSON · v paste JSON · ? help · q quit · Esc cancel',
        opts.color ? CYAN : '',
        opts.color
      )
    ];
  }
  if (state.mode.menu === 'export') {
    return [
      tint(
        'Export — m: markdown→clipboard · h: html→clipboard · w: write markdown file · Esc: cancel',
        BOLD,
        opts.color
      )
    ];
  }
  // repair menu
  const suggestions = suggestRepairs(state.schedule, state.violations);
  if (suggestions.length === 0) {
    return [tint('No automatic repairs available — Esc to close', DIM, opts.color)];
  }
  const lines = [tint('Repairs — press a number to apply, Esc to cancel:', BOLD, opts.color)];
  suggestions.slice(0, 9).forEach((s: RepairSuggestion, i) => {
    lines.push(tint(`  ${i + 1}) ${truncate(s.description, opts.width - 6)}`, GREEN, opts.color));
  });
  return lines;
}

const HELP_TEXT: ReadonlyArray<[string, string]> = [
  ['Type any character', 'Start editing the focused cell (overwrite)'],
  ['Enter', 'Edit cell in place (or toggle Attend)'],
  ['↑ ↓ ← →  /  Tab', 'Move cursor'],
  ['Home / End', 'Jump to first / last row'],
  ['PageUp / PageDown', 'Move 10 rows'],
  ['Space', 'Toggle Attend'],
  ['Esc', 'Cancel edit / prompt / menu'],
  ['', ''],
  ['^K', 'Open the command menu, then:'],
  ['  a / A', 'Add row below / above cursor'],
  ['  x', 'Delete current row'],
  ['  g / G', 'Jump to first / last row'],
  ['  r', 'Repair suggestions for violations'],
  ['  i', 'Import: paste JSON to replace the schedule'],
  ['  e', 'Export menu (markdown / HTML)'],
  ['  s / S', 'Save / Save As (file path)'],
  ['  o', 'Open a schedule file'],
  ['  c / v', 'Copy / paste schedule JSON via clipboard'],
  ['  q', 'Quit (warns on unsaved changes)'],
  ['', ''],
  ['^C', 'Quit immediately']
];

function helpOverlay(opts: RenderOptions): string[] {
  const lines = [tint('Keyboard reference', BOLD + UNDERLINE, opts.color), ''];
  for (const [keys, desc] of HELP_TEXT) {
    lines.push('  ' + pad(keys, 20) + desc);
  }
  lines.push('');
  lines.push(tint('Press any key to return', DIM, opts.color));
  return lines;
}

// Compose the full screen. Returns exactly `height` lines (padded/clipped),
// each without a trailing newline.
export function renderScreen(state: TuiState, opts: RenderOptions = defaultRenderOptions): string[] {
  const out: string[] = [];

  const fileLabel = state.filePath ?? '(unsaved)';
  const dirtyMark = state.dirty ? ' *' : '';
  out.push(tint(` Trip Planner — ${fileLabel}${dirtyMark}`, BOLD, opts.color));
  out.push('');

  if (state.mode.kind === 'help') {
    for (const line of helpOverlay(opts)) out.push(line);
    return fit(out, opts.height);
  }

  out.push(headerLine(opts.color));

  // Reserve space for chrome below the grid so the cursor stays visible.
  const bottom = modeLines(state, opts);
  const violationLineBudget = Math.min(4, state.violations.length === 0 ? 0 : state.violations.length + 1);
  const chromeAbove = 3; // title, blank, header
  const chromeBelow = bottom.length + (violationLineBudget > 0 ? violationLineBudget + 1 : 0) + 1;
  const gridHeight = Math.max(1, opts.height - chromeAbove - chromeBelow);

  const total = state.schedule.rows.length;
  const scrollTop =
    state.cursorRow >= gridHeight ? state.cursorRow - gridHeight + 1 : 0;
  const end = Math.min(total, scrollTop + gridHeight);
  for (let i = scrollTop; i < end; i++) {
    out.push(rowLine(state, i, opts));
  }
  if (scrollTop > 0 || end < total) {
    out.push(tint(`  (rows ${scrollTop + 1}-${end} of ${total})`, DIM, opts.color));
  }

  if (violationLineBudget > 0) {
    out.push('');
    for (const line of violationBlock(state, opts, violationLineBudget)) out.push(line);
  }

  out.push('');
  for (const line of bottom) out.push(line);

  return fit(out, opts.height);
}

// Pad with blank lines or clip to exactly n lines.
function fit(lines: string[], n: number): string[] {
  if (lines.length >= n) return lines.slice(0, n);
  return lines.concat(new Array(n - lines.length).fill(''));
}

// Convenience for tests: plain-text screen, no ANSI, generous size.
export function plainScreen(state: TuiState): string[] {
  return renderScreen(state, { color: false, width: 120, height: 60 }).filter(
    (l) => l.length > 0
  );
}
