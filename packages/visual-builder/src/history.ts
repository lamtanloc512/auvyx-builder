/**
 * Undo/redo for the block tree. Updates sharing a `key` within COALESCE_MS
 * (one drag, one scrub, one text field) collapse into a single undo step.
 */
export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  lastKey?: string;
  lastTime: number;
};

const LIMIT = 100;
export const COALESCE_MS = 1000;

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [], lastTime: 0 });

export const commit = <T>(history: History<T>, next: T, key?: string, now = Date.now()): History<T> => {
  if (key !== undefined && key === history.lastKey && now - history.lastTime < COALESCE_MS) {
    return { ...history, present: next, future: [], lastTime: now };
  }
  return {
    past: [...history.past, history.present].slice(-LIMIT),
    present: next,
    future: [],
    lastKey: key,
    lastTime: now,
  };
};

export const undo = <T>(history: History<T>): History<T> => {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastTime: 0,
  };
};

export const redo = <T>(history: History<T>): History<T> => {
  const [next, ...future] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future, lastTime: 0 };
};
