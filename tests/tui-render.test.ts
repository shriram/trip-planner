import { describe, it, expect } from 'vitest';
import {
  Schedule,
  createEmptySchedule,
  addRowToSchedule,
  createRow,
  parseDate,
  some
} from '../src/model.js';
import { initialState } from '../src/tui/state.js';
import { plainScreen, renderScreen } from '../src/tui/render.js';

function sampleSchedule(): Schedule {
  let s = createEmptySchedule();
  s = addRowToSchedule(
    s,
    createRow(parseDate('2026-06-11')!, {
      daytime: some({ kind: 'travel', from: 'Boston', to: 'London' }),
      night: some('London')
    })
  );
  s = addRowToSchedule(
    s,
    createRow(parseDate('2026-06-12')!, {
      daytime: some({ kind: 'organization', name: 'Acme Corp' }),
      night: some('London')
    })
  );
  return s;
}

describe('plain rendering', () => {
  it('includes a header row with column titles', () => {
    const screen = plainScreen(initialState(sampleSchedule(), null)).join('\n');
    expect(screen).toContain('Date');
    expect(screen).toContain('Daytime');
    expect(screen).toContain('Night');
  });

  it('renders row content', () => {
    const screen = plainScreen(initialState(sampleSchedule(), null)).join('\n');
    expect(screen).toContain('2026-06-11');
    expect(screen).toContain('Boston → London');
    expect(screen).toContain('Acme Corp');
  });

  it('marks the cursor row with a gutter caret', () => {
    const st = initialState(sampleSchedule(), null);
    const lines = plainScreen(st);
    const cursorLine = lines.find((l) => l.startsWith('>'));
    expect(cursorLine).toBeDefined();
    expect(cursorLine).toContain('2026-06-11');
  });

  it('shows the file name and an unsaved marker', () => {
    const st = { ...initialState(sampleSchedule(), 'trip.json'), dirty: true };
    const screen = plainScreen(st).join('\n');
    expect(screen).toContain('trip.json');
    expect(screen).toContain('*');
  });
});

describe('violation block', () => {
  it('lists violations when present', () => {
    // Organization on a Saturday triggers a violation.
    let s = createEmptySchedule();
    s = addRowToSchedule(
      s,
      createRow(parseDate('2026-06-13')!, {
        daytime: some({ kind: 'organization', name: 'Acme' })
      })
    );
    const screen = plainScreen(initialState(s, null)).join('\n');
    expect(screen).toMatch(/Violations \(1\)/);
  });
});

describe('color rendering', () => {
  it('emits ANSI escapes when color is enabled', () => {
    const lines = renderScreen(initialState(sampleSchedule(), null), {
      color: true,
      width: 100,
      height: 30
    });
    expect(lines.join('\n')).toContain('\x1b[');
  });

  it('produces exactly `height` lines', () => {
    const lines = renderScreen(initialState(sampleSchedule(), null), {
      color: false,
      width: 100,
      height: 30
    });
    expect(lines.length).toBe(30);
  });
});
