/// <reference lib="webworker" />
import { prettyJsonText } from './prettyJsonText';

/** Formats JSON off the UI thread; see `prettyJson.ts`. */
self.onmessage = (event: MessageEvent<{ id: number; text: string }>) => {
  const { id, text } = event.data;
  self.postMessage({ id, text: prettyJsonText(text) });
};
