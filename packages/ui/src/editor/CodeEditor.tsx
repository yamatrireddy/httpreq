import { Box, Center, Loader, useComputedColorScheme } from '@mantine/core';
import type { editor } from 'monaco-editor';
import { lazy, Suspense } from 'react';
import { MONO_FONT_FAMILY } from '../theme';

const Editor = lazy(() => import('../LocalEditor'));

interface Props {
  value: string;
  onChange?: (value: string) => void;
  language: string;
  ariaLabel: string;
  readOnly?: boolean;
  className?: string;
  /** Receives the editor instance, e.g. to run "Format Document". */
  onEditor?: (instance: editor.IStandaloneCodeEditor) => void;
}

/** Monaco editor with the app's font, theme and compact defaults (line numbers, search, folding). */
export function CodeEditor({ value, onChange, language, ariaLabel, readOnly, className, onEditor }: Props) {
  const colorScheme = useComputedColorScheme('dark');
  return (
    <Box className={`editor-frame ${className ?? ''}`}>
      <Suspense
        fallback={
          <Center h="100%">
            <Loader size="sm" />
          </Center>
        }
      >
        <Editor
          language={language}
          theme={colorScheme === 'dark' ? 'vs-dark' : 'light'}
          value={value}
          onChange={(content) => onChange?.(content ?? '')}
          onMount={(instance) => onEditor?.(instance)}
          options={{
            ariaLabel,
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: MONO_FONT_FAMILY,
            scrollBeyondLastLine: false,
            padding: { top: 10 },
            automaticLayout: true,
            tabSize: 2,
            formatOnPaste: language === 'json',
            fixedOverflowWidgets: true,
          }}
        />
      </Suspense>
    </Box>
  );
}
