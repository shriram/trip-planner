// Entry point for the terminal UI.
//
//   node dist/tui.js [schedule.json]
//
// With no argument, starts a fresh schedule seeded with today. With a path
// that exists, loads it. With a path that does not exist yet, starts fresh but
// remembers the path so the first save writes there.

import { readFileSync } from 'node:fs';

import {
  Schedule,
  createEmptySchedule,
  addRowToSchedule,
  createRow,
  deserializeSchedule
} from './model.js';

import { initialState } from './tui/state.js';
import { runApp } from './tui/app.js';

function seededSchedule(): Schedule {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return addRowToSchedule(createEmptySchedule(), createRow(today));
}

function loadInitial(path: string | undefined): { schedule: Schedule; filePath: string | null } {
  if (!path) {
    return { schedule: seededSchedule(), filePath: null };
  }

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    // Treat a missing file as "new file at this path".
    return { schedule: seededSchedule(), filePath: path };
  }

  const schedule = deserializeSchedule(text);
  if (!schedule) {
    process.stderr.write(`Invalid schedule JSON: ${path}\n`);
    process.exit(1);
  }
  return { schedule, filePath: path };
}

const { schedule, filePath } = loadInitial(process.argv[2]);
runApp(initialState(schedule, filePath));
