import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

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
