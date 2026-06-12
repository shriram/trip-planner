// Pure key handling.
//
// `handleKey` is a reducer: (state, key) -> { state, effect }. It performs all
// schedule edits and mode transitions purely. Anything touching the world
// (files, clipboard) is expressed as an `Effect` for the shell to run.

import {
  Schedule,
  DaytimeType,
  createRow,
  insertRowAtIndex,
  removeRowFromSchedule,
  recalculateDates,
  updateRowInSchedule,
  addDays,
  parseDate,
  parseDaytime,
  deserializeSchedule,
  some,
  none
} from '../model.js';

import { suggestRepairs, applyRepairAndRecheck } from '../constraints.js';

import {
  TuiState,
  Column,
  PromptPurpose,
  moveCursor,
  setCursor,
  withSchedule,
  withCleanSchedule,
  currentRow,
  cellDisplay
} from './state.js';

import { applyDaytimeChange } from './autofill.js';

export interface Key {
  name: string; // 'up','down','left','right','return','tab','escape','backspace','space', or a char
  shift: boolean;
  ctrl: boolean;
  sequence: string;
}

export type Effect =
  | { kind: 'none' }
  | { kind: 'save'; path: string }
  | { kind: 'open'; path: string }
  | { kind: 'copyJson' }
  | { kind: 'pasteJson' }
  | { kind: 'exportClipboard'; format: 'md' | 'html' }
  | { kind: 'exportFile'; format: 'md' | 'html'; path: string };

const NONE: Effect = { kind: 'none' };

interface Result {
  state: TuiState;
  effect: Effect;
}

function plain(state: TuiState): Result {
  return { state, effect: NONE };
}

function isPrintable(key: Key): boolean {
  if (key.ctrl) return false;
  const chars = Array.from(key.sequence);
  if (chars.length !== 1) return false;
  const code = key.sequence.codePointAt(0) ?? 0;
  return code >= 0x20 && code !== 0x7f;
}

export function handleKey(state: TuiState, key: Key): Result {
  switch (state.mode.kind) {
    case 'navigate':
      return handleNavigate(state, key);
    case 'edit':
      return handleEdit(state, key);
    case 'confirm':
      return handleConfirm(state, key);
    case 'prompt':
      return handlePrompt(state, key);
    case 'menu':
      return handleMenu(state, key);
    case 'import':
      return handleImport(state, key);
    case 'help':
      return plain({ ...state, mode: { kind: 'navigate' } });
  }
}

// Handle a completed clipboard paste (a single block of text from the
// terminal's bracketed-paste). In import or navigate mode the text is treated
// as a whole schedule to load; inside a text field it is inserted inline.
export function handlePaste(state: TuiState, text: string): Result {
  switch (state.mode.kind) {
    case 'import':
    case 'navigate':
      return plain(tryImport(state, text));
    case 'edit':
      return plain({ ...state, mode: { ...state.mode, buffer: state.mode.buffer + inline(text) } });
    case 'prompt':
      return plain({ ...state, mode: { ...state.mode, buffer: state.mode.buffer + inline(text) } });
    default:
      return plain(state);
  }
}

function inline(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ');
}

// Deserialize pasted/typed JSON and, on success, replace the whole schedule.
// On failure, remain in import mode showing an error (nothing is mutated).
export function tryImport(state: TuiState, text: string): TuiState {
  const schedule = deserializeSchedule(text);
  if (!schedule) {
    return {
      ...state,
      mode: {
        kind: 'import',
        buffer: text,
        error: 'Could not parse that as schedule JSON. Paste again, or Esc to cancel.'
      }
    };
  }
  const replaced = withCleanSchedule(state, schedule);
  return {
    ...setCursor(replaced, 0, 'daytime'),
    mode: { kind: 'navigate' },
    status: `Imported ${schedule.rows.length} row(s).`
  };
}

// --- navigate -----------------------------------------------------------
// In navigate mode the grid is driven by arrows/Tab/Enter/Space; typing a
// character starts editing the focused cell (type-to-edit). All verbs live
// behind the ^K command leader so letters never trigger commands while typing.
function handleNavigate(state: TuiState, key: Key): Result {
  const lastRow = Math.max(0, state.schedule.rows.length - 1);

  // ^K opens the command menu (the single leader for every verb).
  if (key.ctrl && key.name === 'k') {
    return plain({ ...state, mode: { kind: 'menu', menu: 'command' }, status: '' });
  }

  switch (key.name) {
    case 'up':
      return plain(moveCursor(state, -1, 0));
    case 'down':
      return plain(moveCursor(state, 1, 0));
    case 'left':
      return plain(moveCursor(state, 0, -1));
    case 'right':
      return plain(moveCursor(state, 0, 1));
    case 'tab':
      return plain(moveCursor(state, 0, key.shift ? -1 : 1));
    case 'home':
      return plain(setCursor(state, 0, state.cursorCol));
    case 'end':
      return plain(setCursor(state, lastRow, state.cursorCol));
    case 'pageup':
      return plain(moveCursor(state, -10, 0));
    case 'pagedown':
      return plain(moveCursor(state, 10, 0));
    case 'space':
      return plain(toggleAttend(state));
    case 'return':
      return plain(beginEdit(state));
    case 'escape':
      return plain({ ...state, status: '' });
  }

  // Type-to-edit: a printable character starts a fresh (overwrite) edit.
  if (isPrintable(key)) return plain(beginTypeEdit(state, key.sequence));

  return plain(state);
}

function toggleAttend(state: TuiState): TuiState {
  const row = currentRow(state);
  if (!row) return state;
  return withSchedule(state, updateRowInSchedule(state.schedule, row.id, { attend: !row.attend }));
}

// Enter: edit the focused cell in place, seeded with its current value.
function beginEdit(state: TuiState): TuiState {
  const row = currentRow(state);
  if (!row) return state;
  if (state.cursorCol === 'attend') return toggleAttend(state);
  if (state.cursorCol === 'date' && state.cursorRow > 0) {
    return { ...state, status: "Only the first row's date is editable." };
  }
  return { ...state, mode: { kind: 'edit', column: state.cursorCol, buffer: cellDisplay(row, state.cursorCol) } };
}

// A printable keystroke: start editing with that character (overwrite).
function beginTypeEdit(state: TuiState, ch: string): TuiState {
  const row = currentRow(state);
  if (!row) return state;
  if (state.cursorCol === 'attend') return state; // not a text cell
  if (state.cursorCol === 'date' && state.cursorRow > 0) {
    return { ...state, status: "Only the first row's date is editable." };
  }
  return { ...state, mode: { kind: 'edit', column: state.cursorCol, buffer: ch } };
}

function addRow(state: TuiState, where: 'above' | 'below'): TuiState {
  const index = state.cursorRow;
  const cur = state.schedule.rows[index];
  if (!cur) {
    // Empty schedule: seed with today.
    const seed = createRow(startOfToday());
    return setCursor(withSchedule(state, recalculateDates(insertRowAtIndex(state.schedule, 0, seed))), 0, 'daytime');
  }
  if (where === 'below') {
    const newRow = createRow(addDays(cur.date, 1));
    const schedule = recalculateDates(insertRowAtIndex(state.schedule, index + 1, newRow));
    return setCursor(withSchedule(state, schedule), index + 1, 'daytime');
  }
  const prev = state.schedule.rows[index - 1];
  const newDate = prev ? addDays(prev.date, 1) : addDays(cur.date, -1);
  const newRow = createRow(newDate);
  const schedule = recalculateDates(insertRowAtIndex(state.schedule, index, newRow));
  return setCursor(withSchedule(state, schedule), index, 'daytime');
}

function deleteRow(state: TuiState): TuiState {
  const row = currentRow(state);
  if (!row) return state;
  let schedule = removeRowFromSchedule(state.schedule, row.id);
  if (schedule.rows.length > 0) schedule = recalculateDates(schedule);
  return withSchedule(state, schedule);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// --- edit ---------------------------------------------------------------
function handleEdit(state: TuiState, key: Key): Result {
  if (state.mode.kind !== 'edit') return plain(state);
  const mode = state.mode;

  if (key.name === 'escape') {
    return plain({ ...state, mode: { kind: 'navigate' }, status: '' });
  }
  if (key.name === 'backspace') {
    const chars = Array.from(mode.buffer);
    chars.pop();
    return plain({ ...state, mode: { ...mode, buffer: chars.join('') } });
  }
  if (isCommitKey(key)) {
    const committed = commitEdit(state, mode.column, mode.buffer);
    if (committed.mode.kind === 'confirm') return plain(committed);
    return plain(moveAfterCommit(committed, key));
  }
  if (isPrintable(key)) {
    return plain({ ...state, mode: { ...mode, buffer: mode.buffer + key.sequence } });
  }
  return plain(state);
}

function isCommitKey(key: Key): boolean {
  return (
    key.name === 'return' ||
    key.name === 'tab' ||
    key.name === 'up' ||
    key.name === 'down' ||
    key.name === 'left' ||
    key.name === 'right'
  );
}

function moveAfterCommit(state: TuiState, key: Key): TuiState {
  switch (key.name) {
    case 'return':
    case 'down':
      return moveCursor(state, 1, 0);
    case 'up':
      return moveCursor(state, -1, 0);
    case 'left':
      return moveCursor(state, 0, -1);
    case 'right':
      return moveCursor(state, 0, 1);
    case 'tab':
      return moveCursor(state, 0, key.shift ? -1 : 1);
    default:
      return state;
  }
}

// Commit the edit buffer to the schedule, applying per-column semantics. May
// return a state in 'confirm' mode if a smart-fill needs the user's yes/no.
export function commitEdit(state: TuiState, column: Column, buffer: string): TuiState {
  const row = currentRow(state);
  if (!row) return { ...state, mode: { kind: 'navigate' } };

  switch (column) {
    case 'date': {
      const parsed = parseDate(buffer.trim());
      if (!parsed) {
        return {
          ...state,
          mode: { kind: 'navigate' },
          status: 'Invalid date. Use YYYY-MM-DD (year 1900–2099).'
        };
      }
      const updated = updateRowInSchedule(state.schedule, row.id, { date: parsed });
      const recalced = recalculateDates(updated);
      return { ...withSchedule(state, recalced), mode: { kind: 'navigate' }, status: '' };
    }
    case 'daytime': {
      const daytime: DaytimeType = parseDaytime(buffer);
      const res = applyDaytimeChange(state.schedule, row.id, daytime);
      const base = withSchedule(state, res.schedule);
      if (res.confirm) {
        return { ...base, mode: { kind: 'confirm', request: res.confirm } };
      }
      return { ...base, mode: { kind: 'navigate' }, status: '' };
    }
    case 'night': {
      const v = buffer.trim();
      const updated = updateRowInSchedule(state.schedule, row.id, { night: v ? some(v) : none() });
      return { ...withSchedule(state, updated), mode: { kind: 'navigate' }, status: '' };
    }
    case 'pinnedEvent': {
      const updated = updateRowInSchedule(state.schedule, row.id, {
        otherEvent: some(parseDaytime(buffer))
      });
      return { ...withSchedule(state, updated), mode: { kind: 'navigate' }, status: '' };
    }
    case 'pinnedLocation': {
      const v = buffer.trim();
      const updated = updateRowInSchedule(state.schedule, row.id, {
        otherLocation: v ? some(v) : none()
      });
      return { ...withSchedule(state, updated), mode: { kind: 'navigate' }, status: '' };
    }
    case 'attend':
      return { ...state, mode: { kind: 'navigate' } };
  }
}

// --- confirm ------------------------------------------------------------
function handleConfirm(state: TuiState, key: Key): Result {
  if (state.mode.kind !== 'confirm') return plain(state);
  const yes = key.sequence === 'y' || key.sequence === 'Y' || key.name === 'return';
  const no = key.sequence === 'n' || key.sequence === 'N' || key.name === 'escape';
  if (yes) {
    const request = state.mode.request;
    const navd: TuiState = {
      ...withSchedule(state, request.apply(state.schedule)),
      mode: { kind: 'navigate' },
      status: ''
    };
    return plain(request.quit ? { ...navd, quit: true } : navd);
  }
  if (no) {
    return plain({ ...state, mode: { kind: 'navigate' }, status: '' });
  }
  return plain(state);
}

// --- prompt -------------------------------------------------------------
function startPrompt(state: TuiState, purpose: PromptPurpose, label: string): TuiState {
  return { ...state, mode: { kind: 'prompt', purpose, label, buffer: state.filePath ?? '' }, status: '' };
}

function handlePrompt(state: TuiState, key: Key): Result {
  if (state.mode.kind !== 'prompt') return plain(state);
  const mode = state.mode;

  if (key.name === 'escape') {
    return plain({ ...state, mode: { kind: 'navigate' }, status: '' });
  }
  if (key.name === 'backspace') {
    const chars = Array.from(mode.buffer);
    chars.pop();
    return plain({ ...state, mode: { ...mode, buffer: chars.join('') } });
  }
  if (key.name === 'return') {
    const path = mode.buffer.trim();
    if (!path) return plain({ ...state, mode: { kind: 'navigate' }, status: 'Cancelled (empty path).' });
    const navState: TuiState = { ...state, mode: { kind: 'navigate' } };
    switch (mode.purpose.kind) {
      case 'save':
        return { state: navState, effect: { kind: 'save', path } };
      case 'open':
        return { state: navState, effect: { kind: 'open', path } };
      case 'export':
        return { state: navState, effect: { kind: 'exportFile', format: mode.purpose.format, path } };
    }
  }
  if (isPrintable(key)) {
    return plain({ ...state, mode: { ...mode, buffer: mode.buffer + key.sequence } });
  }
  return plain(state);
}

// --- menus --------------------------------------------------------------
function navigate(state: TuiState): TuiState {
  return { ...state, mode: { kind: 'navigate' } };
}

function handleMenu(state: TuiState, key: Key): Result {
  if (state.mode.kind !== 'menu') return plain(state);
  if (key.name === 'escape') return plain({ ...navigate(state), status: '' });

  switch (state.mode.menu) {
    case 'command':
      return handleCommandMenu(state, key);
    case 'export':
      return handleExportMenu(state, key);
    case 'repair':
      return handleRepairMenu(state, key);
  }
}

// The ^K leader menu: letter mnemonics select a verb. Picking one either acts
// immediately, opens a sub-mode (import/export/repair/prompt), or emits an
// effect. Unrecognized keys leave the menu open.
function handleCommandMenu(state: TuiState, key: Key): Result {
  const nav = navigate(state);
  switch (key.sequence) {
    case 'a':
      return plain(addRow(nav, 'below'));
    case 'A':
      return plain(addRow(nav, 'above'));
    case 'x':
      return plain(deleteRow(nav));
    case 'g':
      return plain(setCursor(nav, 0, state.cursorCol));
    case 'G':
      return plain(setCursor(nav, Math.max(0, state.schedule.rows.length - 1), state.cursorCol));
    case 'r':
      return plain({ ...state, mode: { kind: 'menu', menu: 'repair' }, status: '' });
    case 'e':
      return plain({ ...state, mode: { kind: 'menu', menu: 'export' }, status: '' });
    case 'i':
      return plain({ ...state, mode: { kind: 'import', buffer: '', error: null }, status: '' });
    case 's':
      if (state.filePath) return { state: nav, effect: { kind: 'save', path: state.filePath } };
      return plain(startPrompt(state, { kind: 'save' }, 'Save to path'));
    case 'S':
      return plain(startPrompt(state, { kind: 'save' }, 'Save as path'));
    case 'o':
      return plain(startPrompt(state, { kind: 'open' }, 'Open path'));
    case 'c':
      return { state: nav, effect: { kind: 'copyJson' } };
    case 'v':
      return { state: nav, effect: { kind: 'pasteJson' } };
    case '?':
      return plain({ ...state, mode: { kind: 'help' } });
    case 'q':
      if (!state.dirty) return plain({ ...nav, quit: true });
      return plain({
        ...state,
        mode: {
          kind: 'confirm',
          request: { question: 'Discard unsaved changes and quit?', apply: (s) => s, quit: true }
        }
      });
    default:
      return plain(state);
  }
}

function handleExportMenu(state: TuiState, key: Key): Result {
  const nav = navigate(state);
  switch (key.sequence) {
    case 'm':
      return { state: nav, effect: { kind: 'exportClipboard', format: 'md' } };
    case 'h':
      return { state: nav, effect: { kind: 'exportClipboard', format: 'html' } };
    case 'w':
      return plain(startExportFilePrompt(state, 'md'));
    default:
      return plain(state);
  }
}

function handleRepairMenu(state: TuiState, key: Key): Result {
  const suggestions = suggestRepairs(state.schedule, state.violations);
  const digit = key.sequence >= '1' && key.sequence <= '9' ? Number(key.sequence) - 1 : -1;
  if (digit >= 0 && digit < suggestions.length) {
    const { schedule } = applyRepairAndRecheck(state.schedule, suggestions[digit]);
    return plain({
      ...withSchedule(state, schedule),
      mode: { kind: 'navigate' },
      status: 'Repair applied.'
    });
  }
  return plain(state);
}

// --- import -------------------------------------------------------------
function handleImport(state: TuiState, key: Key): Result {
  if (state.mode.kind !== 'import') return plain(state);
  const mode = state.mode;

  if (key.name === 'escape') {
    return plain({ ...state, mode: { kind: 'navigate' }, status: 'Import cancelled.' });
  }
  // Apply whatever has been buffered (typically populated by a paste, but this
  // also supports manually typed/assembled JSON).
  if (key.name === 'return') {
    if (!mode.buffer.trim()) {
      return plain({ ...state, mode: { ...mode, error: 'Nothing to import yet — paste your JSON first.' } });
    }
    return plain(tryImport(state, mode.buffer));
  }
  if (key.name === 'backspace') {
    const chars = Array.from(mode.buffer);
    chars.pop();
    return plain({ ...state, mode: { ...mode, buffer: chars.join(''), error: null } });
  }
  if (isPrintable(key)) {
    return plain({ ...state, mode: { ...mode, buffer: mode.buffer + key.sequence, error: null } });
  }
  return plain(state);
}

function startExportFilePrompt(state: TuiState, format: 'md' | 'html'): TuiState {
  const ext = format === 'md' ? '.md' : '.html';
  const suggested = state.filePath ? state.filePath.replace(/\.json$/i, '') + ext : '';
  return {
    ...state,
    mode: { kind: 'prompt', purpose: { kind: 'export', format }, label: `Write ${format} to path`, buffer: suggested }
  };
}
