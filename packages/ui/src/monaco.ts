import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
// Tokenizer-only grammars (no language workers) for text bodies and request scripts.
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution';

(
  globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker(moduleId: string, label: string): Worker };
  }
).MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    return label === 'json' ? new JsonWorker() : new EditorWorker();
  },
};

loader.config({ monaco });

// Monaco measures glyph widths once. The bundled monospace web font may finish loading after the
// first editor mounts, so re-measure when it arrives to keep the cursor aligned with the text.
if (typeof document !== 'undefined' && 'fonts' in document) {
  void document.fonts
    .load("13px 'JetBrains Mono'")
    .then(() => monaco.editor.remeasureFonts())
    .catch(() => undefined);
}
