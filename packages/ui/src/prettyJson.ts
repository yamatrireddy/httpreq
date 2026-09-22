import { prettyJsonText } from './prettyJsonText';

/**
 * Bodies from this size up are formatted in a worker. Parsing and re-serializing a 25 MB response
 * blocked the UI thread for about 190 ms; small bodies format in well under a frame, where posting
 * them to a worker would cost more than it saves.
 */
export const WORKER_FORMAT_THRESHOLD = 256 * 1024;

type Pending = { text: string; resolve: (formatted: string) => void };

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();

/** Settles everything still waiting on the main thread, when the worker cannot be used. */
const drain = () => {
  for (const job of pending.values()) job.resolve(prettyJsonText(job.text));
  pending.clear();
};

const formatter = (): Worker | null => {
  if (worker !== undefined) return worker;
  try {
    worker =
      typeof Worker === 'undefined'
        ? null
        : new Worker(new URL('./prettyJson.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  worker?.addEventListener('message', (event: MessageEvent<{ id: number; text: string }>) => {
    const job = pending.get(event.data.id);
    pending.delete(event.data.id);
    job?.resolve(event.data.text);
  });
  worker?.addEventListener('error', () => {
    // A worker that fails to load (a strict CSP, an old runtime) is not retried.
    worker?.terminate();
    worker = null;
    drain();
  });
  return worker;
};

/** Indented JSON (or the text unchanged when it is not JSON), formatted off the UI thread when large. */
export const prettyJson = (text: string): Promise<string> => {
  if (text.length < WORKER_FORMAT_THRESHOLD) return Promise.resolve(prettyJsonText(text));
  const target = formatter();
  if (!target) return Promise.resolve(prettyJsonText(text));
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { text, resolve });
    target.postMessage({ id, text });
  });
};
