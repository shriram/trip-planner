import { describe, it, expect } from 'vitest';
import {
  Schedule,
  createEmptySchedule,
  addRowToSchedule,
  createRow,
  parseDate,
  formatDate,
  formatDaytime,
  getDaytimeValue,
  getOrDefault,
  some
} from '../src/model.js';
import { initialState, TuiState } from '../src/tui/state.js';
import { handleKey, handlePaste, Key } from '../src/tui/keys.js';
import { serializeSchedule } from '../src/model.js';

function schedule(n: number): Schedule {
  let s = createEmptySchedule();
  const start = parseDate('2026-06-11')!; // Thursday
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    s = addRowToSchedule(s, createRow(d));
  }
  return s;
}

// Key builders.
function key(name: string, extra: Partial<Key> = {}): Key {
  return { name, shift: false, ctrl: false, sequence: '', ...extra };
}
function ch(c: string): Key {
  return { name: c, shift: false, ctrl: false, sequence: c };
}

// Feed a sequence of keys, returning the final state (ignores effects).
function feed(state: TuiState, keys: Key[]): TuiState {
  return keys.reduce((s, k) => handleKey(s, k).state, state);
}
function type(text: string): Key[] {
  return Array.from(text).map((c) => ch(c));
}

// The ^K command leader, and helpers to drive the leader menu.
const LEADER: Key = { name: 'k', shift: false, ctrl: true, sequence: '\x0b' };
function openMenu(state: TuiState): TuiState {
  return handleKey(state, LEADER).state;
}
function cmd(state: TuiState, letter: string) {
  return handleKey(openMenu(state), ch(letter));
}

describe('navigation', () => {
  it('arrows move the cursor', () => {
    const st = initialState(schedule(3), null);
    const down = handleKey(st, key('down')).state;
    expect(down.cursorRow).toBe(1);
    const right = handleKey(down, key('right')).state;
    expect(right.cursorRow).toBe(1);
    expect(right.cursorCol).not.toBe(down.cursorCol);
  });

  it('Tab moves right, Shift-Tab moves left', () => {
    const st = initialState(schedule(3), null);
    const right = handleKey(st, key('tab')).state;
    const back = handleKey(right, key('tab', { shift: true })).state;
    expect(back.cursorCol).toBe(st.cursorCol);
  });

  it('Home / End jump to first / last row', () => {
    const st = initialState(schedule(5), null);
    const end = handleKey(st, key('end')).state;
    expect(end.cursorRow).toBe(4);
    expect(handleKey(end, key('home')).state.cursorRow).toBe(0);
  });

  it('^K g / G jump to first / last row', () => {
    const st = initialState(schedule(5), null);
    expect(cmd(st, 'G').state.cursorRow).toBe(4);
    const end = cmd(st, 'G').state;
    expect(cmd(end, 'g').state.cursorRow).toBe(0);
  });
});

describe('editing', () => {
  it('Enter on a text cell enters edit mode seeded with the current value', () => {
    let st = initialState(schedule(1), null); // cursor on daytime
    st = { ...st, schedule: { ...st.schedule, rows: st.schedule.rows.map((r) => ({ ...r, daytime: some({ kind: 'organization', name: 'Existing' } as const) })) } };
    const editing = handleKey(st, key('return')).state;
    expect(editing.mode.kind).toBe('edit');
    if (editing.mode.kind === 'edit') expect(editing.mode.buffer).toBe('Existing');
  });

  it('typing a character starts an overwrite edit with that character', () => {
    let st = initialState(schedule(1), null);
    st = { ...st, schedule: { ...st.schedule, rows: st.schedule.rows.map((r) => ({ ...r, daytime: some({ kind: 'organization', name: 'Existing' } as const) })) } };
    const editing = handleKey(st, ch('P')).state;
    expect(editing.mode.kind).toBe('edit');
    if (editing.mode.kind === 'edit') expect(editing.mode.buffer).toBe('P'); // not "ExistingP"
  });

  it('typing on a cell then committing stores the typed value', () => {
    const st = initialState(schedule(1), null);
    const after = feed(st, [...type('Acme Corp'), key('return')]);
    expect(formatDaytime(getDaytimeValue(after.schedule.rows[0].daytime))).toBe('Acme Corp');
  });

  it('typing then committing updates the daytime', () => {
    const st = initialState(schedule(1), null);
    const after = feed(st, [key('return'), ...type('Acme Corp'), key('return')]);
    expect(after.mode.kind).toBe('navigate');
    expect(formatDaytime(getDaytimeValue(after.schedule.rows[0].daytime))).toBe('Acme Corp');
    expect(after.dirty).toBe(true);
  });

  it('Esc cancels an edit without changing the schedule', () => {
    const st = initialState(schedule(1), null);
    const after = feed(st, [key('return'), ...type('Nope'), key('escape')]);
    expect(after.mode.kind).toBe('navigate');
    expect(formatDaytime(getDaytimeValue(after.schedule.rows[0].daytime))).toBe('');
    expect(after.dirty).toBe(false);
  });

  it('backspace removes the last character of the buffer', () => {
    const st = initialState(schedule(1), null);
    const after = feed(st, [key('return'), ...type('ABC'), key('backspace'), key('return')]);
    expect(formatDaytime(getDaytimeValue(after.schedule.rows[0].daytime))).toBe('AB');
  });

  it('committing travel auto-fills the night', () => {
    const st = initialState(schedule(1), null);
    const after = feed(st, [key('return'), ...type('London -> Paris'), key('return')]);
    expect(getOrDefault(after.schedule.rows[0].night, '')).toBe('Paris');
  });

  it('only the first row date is editable', () => {
    let st = initialState(schedule(3), null);
    st = { ...st, cursorRow: 1, cursorCol: 'date' };
    const after = handleKey(st, key('return')).state;
    expect(after.mode.kind).toBe('navigate');
    expect(after.status).toMatch(/first row/i);
  });
});

describe('attend toggle', () => {
  it('space toggles the attend flag', () => {
    const st = initialState(schedule(1), null);
    const on = handleKey(st, key('space')).state;
    expect(on.schedule.rows[0].attend).toBe(true);
    const off = handleKey(on, key('space')).state;
    expect(off.schedule.rows[0].attend).toBe(false);
  });
});

describe('row insertion and deletion', () => {
  it('^K a adds a row below and keeps dates contiguous', () => {
    const st = initialState(schedule(2), null);
    const after = cmd(st, 'a').state;
    expect(after.schedule.rows.length).toBe(3);
    expect(formatDate(after.schedule.rows[1].date)).toBe('2026-06-12');
    expect(after.cursorRow).toBe(1);
  });

  it('^K A adds a row above', () => {
    let st = initialState(schedule(2), null);
    st = { ...st, cursorRow: 1 };
    const after = cmd(st, 'A').state;
    expect(after.schedule.rows.length).toBe(3);
    expect(after.cursorRow).toBe(1);
  });

  it('^K x deletes the current row and recalculates dates', () => {
    let st = initialState(schedule(3), null);
    st = handleKey(st, key('down')).state;
    const after = cmd(st, 'x').state;
    expect(after.schedule.rows.length).toBe(2);
    expect(formatDate(after.schedule.rows[0].date)).toBe('2026-06-11');
    expect(formatDate(after.schedule.rows[1].date)).toBe('2026-06-12');
  });
});

describe('confirm flow', () => {
  it('committing a conflicting travel night opens a confirm, then y applies it', () => {
    let st = initialState(schedule(2), null);
    // Give row 1 an existing night.
    st = { ...st, schedule: { ...st.schedule, rows: st.schedule.rows.map((r, i) => (i === 1 ? { ...r, night: some('Berlin') } : r)) } };
    st = { ...st, cursorRow: 1, cursorCol: 'daytime' };
    const confirming = feed(st, [key('return'), ...type('London -> Paris'), key('return')]);
    expect(confirming.mode.kind).toBe('confirm');
    expect(getOrDefault(confirming.schedule.rows[1].night, '')).toBe('Berlin');
    const yes = handleKey(confirming, ch('y')).state;
    expect(yes.mode.kind).toBe('navigate');
    expect(getOrDefault(yes.schedule.rows[1].night, '')).toBe('Paris');
  });

  it('n declines the confirm, leaving the base change', () => {
    let st = initialState(schedule(2), null);
    st = { ...st, schedule: { ...st.schedule, rows: st.schedule.rows.map((r, i) => (i === 1 ? { ...r, night: some('Berlin') } : r)) } };
    st = { ...st, cursorRow: 1, cursorCol: 'daytime' };
    const confirming = feed(st, [key('return'), ...type('London -> Paris'), key('return')]);
    const no = handleKey(confirming, ch('n')).state;
    expect(no.mode.kind).toBe('navigate');
    expect(getOrDefault(no.schedule.rows[1].night, '')).toBe('Berlin');
  });
});

describe('repair menu', () => {
  it('applies a numbered repair suggestion', () => {
    // Organization on a Saturday (2026-06-13) -> org-on-weekend, repairable to personal.
    const base = schedule(3); // rows: Thu, Fri, Sat
    const withOrg: Schedule = {
      ...base,
      rows: base.rows.map((r, i) =>
        i === 2 ? { ...r, daytime: some({ kind: 'organization', name: 'Acme' } as const) } : r
      )
    };
    const st = initialState(withOrg, null); // computes violations
    expect(st.violations.length).toBeGreaterThan(0);
    const repaired = feed(st, [LEADER, ch('r'), ch('1')]);
    expect(repaired.mode.kind).toBe('navigate');
    expect(repaired.violations.length).toBe(0);
  });
});

describe('command menu produces effects', () => {
  it('^K s with a known path emits a save effect', () => {
    const st = initialState(schedule(1), '/tmp/trip.json');
    const res = cmd(st, 's');
    expect(res.effect).toEqual({ kind: 'save', path: '/tmp/trip.json' });
  });

  it('^K s with no path opens a save prompt', () => {
    const st = initialState(schedule(1), null);
    const res = cmd(st, 's');
    expect(res.effect.kind).toBe('none');
    expect(res.state.mode.kind).toBe('prompt');
  });

  it('a save prompt emits a save effect on Enter', () => {
    const st = initialState(schedule(1), null);
    const prompting = cmd(st, 's').state;
    const typed = feed(prompting, type('/tmp/out.json'));
    const res = handleKey(typed, key('return'));
    expect(res.effect).toEqual({ kind: 'save', path: '/tmp/out.json' });
    expect(res.state.mode.kind).toBe('navigate');
  });

  it('^K e then m emits a markdown clipboard effect', () => {
    const st = initialState(schedule(1), null);
    const menu = cmd(st, 'e').state;
    expect(menu.mode.kind).toBe('menu');
    const res = handleKey(menu, ch('m'));
    expect(res.effect).toEqual({ kind: 'exportClipboard', format: 'md' });
  });

  it('^K c emits a copy-json effect', () => {
    const st = initialState(schedule(1), null);
    expect(cmd(st, 'c').effect).toEqual({ kind: 'copyJson' });
  });

  it('an unrecognized key leaves the command menu open', () => {
    const st = initialState(schedule(1), null);
    const res = handleKey(openMenu(st), ch('z'));
    expect(res.state.mode.kind).toBe('menu');
  });

  it('Esc closes the command menu', () => {
    const st = initialState(schedule(1), null);
    const res = handleKey(openMenu(st), key('escape'));
    expect(res.state.mode.kind).toBe('navigate');
  });
});

describe('import', () => {
  function sampleJson(): string {
    // Build a two-row schedule and serialize it the way the app would.
    const base = schedule(2);
    const populated: Schedule = {
      ...base,
      rows: base.rows.map((r, i) =>
        i === 0 ? { ...r, daytime: some({ kind: 'organization', name: 'Imported Co' } as const) } : r
      )
    };
    return serializeSchedule(populated);
  }

  it('^K i opens import mode', () => {
    const st = initialState(schedule(1), null);
    const after = cmd(st, 'i').state;
    expect(after.mode.kind).toBe('import');
  });

  it('a paste in import mode replaces the whole schedule', () => {
    const st = { ...initialState(schedule(1), null), mode: { kind: 'import', buffer: '', error: null } as const };
    const after = handlePaste(st, sampleJson()).state;
    expect(after.mode.kind).toBe('navigate');
    expect(after.schedule.rows.length).toBe(2);
    expect(formatDaytime(getDaytimeValue(after.schedule.rows[0].daytime))).toBe('Imported Co');
    expect(after.cursorRow).toBe(0);
  });

  it('import is treated as clean (not dirty)', () => {
    const dirty = { ...initialState(schedule(1), null), dirty: true, mode: { kind: 'import', buffer: '', error: null } as const };
    const after = handlePaste(dirty, sampleJson()).state;
    expect(after.dirty).toBe(false);
  });

  it('a paste in navigate mode also imports (safety net for stray ⌘V)', () => {
    const st = initialState(schedule(1), null);
    const after = handlePaste(st, sampleJson()).state;
    expect(after.schedule.rows.length).toBe(2);
    expect(after.mode.kind).toBe('navigate');
  });

  it('invalid JSON keeps import mode and reports an error without mutating', () => {
    const st = { ...initialState(schedule(3), null), mode: { kind: 'import', buffer: '', error: null } as const };
    const before = st.schedule;
    const after = handlePaste(st, 'not json at all {[').state;
    expect(after.mode.kind).toBe('import');
    if (after.mode.kind === 'import') expect(after.mode.error).toBeTruthy();
    expect(after.schedule).toBe(before); // unchanged reference
  });

  it('Esc cancels import without changing the schedule', () => {
    const st = { ...initialState(schedule(2), null), mode: { kind: 'import', buffer: 'partial', error: null } as const };
    const after = handleKey(st, key('escape')).state;
    expect(after.mode.kind).toBe('navigate');
    expect(after.schedule.rows.length).toBe(2);
  });

  it('Enter in import mode applies the buffered JSON', () => {
    const json = sampleJson();
    const st = { ...initialState(schedule(1), null), mode: { kind: 'import', buffer: json, error: null } as const };
    const after = handleKey(st, key('return')).state;
    expect(after.schedule.rows.length).toBe(2);
    expect(after.mode.kind).toBe('navigate');
  });

  it('pasting into an edit field inserts inline text (newlines stripped)', () => {
    let st = initialState(schedule(1), null);
    st = handleKey(st, key('return')).state; // enter edit on daytime
    const after = handlePaste(st, 'Acme\nCorp').state;
    expect(after.mode.kind).toBe('edit');
    if (after.mode.kind === 'edit') expect(after.mode.buffer).toBe('Acme Corp');
  });
});

describe('quit', () => {
  it('^K q quits immediately when clean', () => {
    const st = initialState(schedule(1), null);
    expect(cmd(st, 'q').state.quit).toBe(true);
  });

  it('^K q on a dirty schedule asks to confirm; y discards and quits', () => {
    const st = initialState(schedule(1), null);
    const dirty = handleKey(st, key('space')).state; // toggling attend marks dirty
    const confirming = cmd(dirty, 'q').state;
    expect(confirming.mode.kind).toBe('confirm');
    expect(confirming.quit).toBe(false);
    expect(handleKey(confirming, ch('y')).state.quit).toBe(true);
  });

  it('declining the quit confirm stays in the app', () => {
    const st = initialState(schedule(1), null);
    const dirty = handleKey(st, key('space')).state;
    const confirming = cmd(dirty, 'q').state;
    const stay = handleKey(confirming, ch('n')).state;
    expect(stay.quit).toBe(false);
    expect(stay.mode.kind).toBe('navigate');
  });
});
