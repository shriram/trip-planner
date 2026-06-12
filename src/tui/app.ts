// Imperative shell for the TUI.
//
// This is the only module that talks to the terminal, filesystem, and
// clipboard. It owns the mutable `state` cell, feeds keypresses to the pure
// `handleKey` reducer, runs the resulting effects, and redraws.

import * as readline from 'node:readline';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

import {
  serializeSchedule,
  deserializeSchedule,
  printToMarkdown,
  printToHtml
} from '../model.js';

import { renderScreen } from './render.js';
import { handleKey, handlePaste, Key, Effect } from './keys.js';
import { TuiState, withCleanSchedule } from './state.js';

const ESC = '\x1b[';
const ALT_SCREEN_ON = `${ESC}?1049h`;
const ALT_SCREEN_OFF = `${ESC}?1049l`;
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const CLEAR_EOL = `${ESC}K`;
const CLEAR_BELOW = `${ESC}J`;
const HOME = `${ESC}H`;
// Bracketed paste: the terminal wraps pasted text in ESC[200~ … ESC[201~ so we
// can treat it as a single block instead of a flood of simulated keystrokes.
const BRACKETED_PASTE_ON = `${ESC}?2004h`;
const BRACKETED_PASTE_OFF = `${ESC}?2004l`;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function clipboardWrite(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('pbcopy');
    proc.on('error', reject);
    proc.on('close', () => resolve());
    proc.stdin.end(text);
  });
}

function clipboardRead(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('pbpaste');
    let out = '';
    proc.on('error', reject);
    proc.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    proc.on('close', () => resolve(out));
  });
}

function normalizeKey(str: string | undefined, info: readline.Key | undefined): Key {
  let name = info?.name ?? '';
  if (name === 'enter') name = 'return';
  const sequence = info?.sequence ?? str ?? '';
  return {
    name,
    shift: info?.shift ?? false,
    ctrl: info?.ctrl ?? false,
    sequence
  };
}

export function runApp(initial: TuiState): void {
  const stdin = process.stdin;
  const stdout = process.stdout;

  if (!stdin.isTTY) {
    process.stderr.write('trip-planner TUI requires an interactive terminal (TTY).\n');
    process.exit(1);
  }

  let state = initial;

  // A short escapeCodeTimeout stops Node from absorbing a lone Esc into a
  // Meta/Alt combo with the next key (which made Esc need 2–3 presses). Real
  // escape sequences (arrows, paste markers) still arrive as one chunk and
  // parse correctly. The 2nd arg is read only for `.escapeCodeTimeout`.
  readline.emitKeypressEvents(stdin, { escapeCodeTimeout: 20 } as unknown as readline.Interface);
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write(ALT_SCREEN_ON + HIDE_CURSOR + BRACKETED_PASTE_ON);

  let cleanedUp = false;
  function cleanup(): void {
    if (cleanedUp) return;
    cleanedUp = true;
    stdout.write(BRACKETED_PASTE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  }

  function finish(): void {
    cleanup();
    process.exit(0);
  }

  function draw(): void {
    const lines = renderScreen(state, {
      color: true,
      width: stdout.columns ?? 100,
      height: stdout.rows ?? 40
    });
    const body = lines.map((l) => l + CLEAR_EOL).join('\r\n');
    stdout.write(HOME + body + CLEAR_BELOW);
  }

  async function runEffect(effect: Effect): Promise<void> {
    switch (effect.kind) {
      case 'none':
        return;
      case 'save': {
        try {
          await writeFile(effect.path, serializeSchedule(state.schedule), 'utf8');
          state = { ...state, filePath: effect.path, dirty: false, status: `Saved ${effect.path}` };
        } catch (err) {
          state = { ...state, status: `Save failed: ${errMsg(err)}` };
        }
        return;
      }
      case 'open': {
        try {
          const text = await readFile(effect.path, 'utf8');
          const schedule = deserializeSchedule(text);
          if (!schedule) {
            state = { ...state, status: `Open failed: invalid JSON in ${effect.path}` };
            return;
          }
          state = withCleanSchedule({ ...state, filePath: effect.path }, schedule);
          state = { ...state, status: `Opened ${effect.path}` };
        } catch (err) {
          state = { ...state, status: `Open failed: ${errMsg(err)}` };
        }
        return;
      }
      case 'copyJson': {
        try {
          await clipboardWrite(serializeSchedule(state.schedule));
          state = { ...state, status: 'Schedule JSON copied to clipboard.' };
        } catch (err) {
          state = { ...state, status: `Copy failed: ${errMsg(err)}` };
        }
        return;
      }
      case 'pasteJson': {
        try {
          const text = await clipboardRead();
          const schedule = deserializeSchedule(text);
          if (!schedule) {
            state = { ...state, status: 'Paste failed: clipboard has no valid schedule JSON.' };
            return;
          }
          state = withCleanSchedule(state, schedule);
          state = { ...state, status: 'Schedule pasted from clipboard.' };
        } catch (err) {
          state = { ...state, status: `Paste failed: ${errMsg(err)}` };
        }
        return;
      }
      case 'exportClipboard': {
        const text =
          effect.format === 'md' ? printToMarkdown(state.schedule) : printToHtml(state.schedule);
        try {
          await clipboardWrite(text);
          state = { ...state, status: `${effect.format.toUpperCase()} copied to clipboard.` };
        } catch (err) {
          state = { ...state, status: `Export failed: ${errMsg(err)}` };
        }
        return;
      }
      case 'exportFile': {
        const text =
          effect.format === 'md' ? printToMarkdown(state.schedule) : printToHtml(state.schedule);
        try {
          await writeFile(effect.path, text, 'utf8');
          state = { ...state, status: `Wrote ${effect.path}` };
        } catch (err) {
          state = { ...state, status: `Write failed: ${errMsg(err)}` };
        }
        return;
      }
    }
  }

  // While a bracketed paste is in progress this holds the accumulated text;
  // it is null when not pasting. Characters arriving during a paste are buffered
  // here and delivered to the reducer as one block, never as commands.
  let pasteBuffer: string | null = null;

  function dispatch(result: { state: TuiState; effect: Effect }): void {
    state = result.state;
    if (result.effect.kind === 'none') {
      draw();
      if (state.quit) finish();
      return;
    }
    runEffect(result.effect)
      .catch((err) => {
        state = { ...state, status: `Error: ${errMsg(err)}` };
      })
      .finally(() => {
        draw();
        if (state.quit) finish();
      });
  }

  stdin.on('keypress', (str: string | undefined, info: readline.Key | undefined) => {
    if (info?.name === 'paste-start') {
      pasteBuffer = '';
      return;
    }
    if (info?.name === 'paste-end') {
      const text = pasteBuffer ?? '';
      pasteBuffer = null;
      dispatch(handlePaste(state, text));
      return;
    }
    if (pasteBuffer !== null) {
      // Inside a paste: accumulate literal text (incl. newlines) as content.
      pasteBuffer += str ?? info?.sequence ?? '';
      return;
    }

    if (info?.ctrl && info.name === 'c') {
      finish();
      return;
    }

    dispatch(handleKey(state, normalizeKey(str, info)));
  });

  stdout.on('resize', draw);
  process.on('SIGINT', finish);

  draw();
}
