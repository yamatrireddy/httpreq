import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleMinus,
  IconCircleX,
  IconFile,
  IconFileImport,
  IconFolderOpen,
  IconTerminal2,
  IconX,
} from '@tabler/icons-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { AppModal } from '../AppModal';
import { formatSize } from '../format';
import { methodColor } from '../methods';
import { useWorkbenchStore } from '../store';
import { applyImportPlan } from './apply';
import { parseCurl } from './curl';
import { importErrorMessage } from './errors';
import { mergeSources, sourcesFromDrop, sourcesFromFileList } from './files';
import { closeImportDialog, useImportDialog, type ImportMode } from './importDialogStore';
import {
  importFiles,
  type ImportFileResult,
  type ImportProgress,
  type ImportSourceFile,
  type ImportStatus,
} from './run';
import { SUPPORTED_ACCEPT } from './sources';
import { FORMAT_LABEL, type EnvironmentConflict, type ImportPlan } from './types';
import classes from './Import.module.css';

const CONFLICT_OPTIONS: { value: EnvironmentConflict; label: string }[] = [
  { value: 'merge', label: 'Merge variables into it' },
  { value: 'replace', label: 'Replace its variables' },
  { value: 'copy', label: 'Keep it and create a copy' },
];

const STATUS_ICON: Record<ImportStatus, typeof IconCircleCheck> = {
  imported: IconCircleCheck,
  skipped: IconCircleMinus,
  failed: IconCircleX,
};
const STATUS_COLOR: Record<ImportStatus, string> = {
  imported: 'teal',
  skipped: 'gray',
  failed: 'red',
};
const STATUS_ORDER: Record<ImportStatus, number> = { failed: 0, skipped: 1, imported: 2 };

type Phase = 'select' | 'running' | 'done';

/** Merges a plan into the live workspace and reveals what it added. */
const applyToStore = (plan: ImportPlan, conflict: EnvironmentConflict) => {
  const store = useWorkbenchStore.getState();
  const result = applyImportPlan(store.workspace, plan, conflict);
  store.applyImport(result.workspace, result.rootId, result.kind);
  return result.message;
};

/**
 * Imports requests, collections and environments: a pasted cURL command, or any number of files
 * and folders (OpenAPI, Postman collections and environments, .env files, HttpReq exports). Files
 * are validated and imported one by one, so a broken file never blocks the rest.
 */
export function ImportDialog() {
  const { opened, mode } = useImportDialog();
  const [curl, setCurl] = useState('');
  const [files, setFiles] = useState<ImportSourceFile[]>([]);
  const [conflict, setConflict] = useState<EnvironmentConflict>('merge');
  const [phase, setPhase] = useState<Phase>('select');
  const [progress, setProgress] = useState<ImportProgress>({ done: 0, total: 0, current: null });
  const [results, setResults] = useState<ImportFileResult[]>([]);
  const [dragging, setDragging] = useState(false);
  const running = useRef<AbortController | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const parsed = useMemo(() => {
    if (!curl.trim()) return null;
    try {
      return { request: parseCurl(curl), error: null };
    } catch (error) {
      return { request: null, error: importErrorMessage(error) };
    }
  }, [curl]);

  const reset = () => {
    setFiles([]);
    setResults([]);
    setPhase('select');
    setProgress({ done: 0, total: 0, current: null });
  };

  const close = () => {
    running.current?.abort();
    running.current = null;
    closeImportDialog();
    // The pasted command is kept for next time; a file selection or a finished run is not.
    reset();
  };

  const setMode = (value: ImportMode) => useImportDialog.setState({ mode: value });

  const add = (added: ImportSourceFile[]) => setFiles((current) => mergeSources(current, added));

  const importCurl = () => {
    if (!parsed?.request) return;
    const message = applyToStore(
      { type: 'request', format: 'curl', request: parsed.request, warnings: [] },
      conflict,
    );
    notifications.show({ color: 'teal', title: 'Imported from cURL', message });
    setCurl('');
    closeImportDialog();
  };

  const importAll = async () => {
    // One run at a time: the button is disabled while running, and this guards double clicks.
    if (running.current || files.length === 0) return;
    const controller = new AbortController();
    running.current = controller;
    setPhase('running');
    const outcome = await importFiles(
      files,
      (plan) => applyToStore(plan, conflict),
      setProgress,
      controller.signal,
    );
    if (controller.signal.aborted) {
      const done = outcome.filter((result) => result.status === 'imported').length;
      notifications.show({
        color: 'yellow',
        title: 'Import cancelled',
        message: `${done} of ${files.length} files were imported before the import was cancelled.`,
      });
      return;
    }
    running.current = null;
    setResults(outcome);
    setPhase('done');
  };

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (phase !== 'select') return;
    add(await sourcesFromDrop(event.dataTransfer));
  };

  const counts = results.reduce(
    (total, result) => ({ ...total, [result.status]: total[result.status] + 1 }),
    { imported: 0, skipped: 0, failed: 0 } as Record<ImportStatus, number>,
  );

  const footer =
    mode === 'curl' ? (
      <>
        <Button variant="default" onClick={close}>
          Cancel
        </Button>
        <Button
          leftSection={<IconFileImport size={14} />}
          disabled={!parsed?.request}
          onClick={importCurl}
        >
          Import request
        </Button>
      </>
    ) : phase === 'running' ? (
      <>
        <Button variant="default" onClick={close}>
          Cancel
        </Button>
        <Button loading disabled>
          Importing…
        </Button>
      </>
    ) : phase === 'done' ? (
      <>
        <Button variant="default" onClick={reset}>
          Import more
        </Button>
        <Button onClick={close}>Done</Button>
      </>
    ) : (
      <>
        <Button variant="default" onClick={close}>
          Cancel
        </Button>
        <Button
          leftSection={<IconFileImport size={14} />}
          disabled={files.length === 0}
          onClick={() => void importAll()}
        >
          {files.length > 1 ? `Import ${files.length} files` : 'Import'}
        </Button>
      </>
    );

  return (
    <AppModal
      opened={opened}
      onClose={close}
      title="Import"
      size="lg"
      centered
      closeOnClickOutside={phase !== 'running'}
      closeOnEscape={phase !== 'running'}
      footer={footer}
    >
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          size="xs"
          value={mode}
          onChange={(value) => setMode(value as ImportMode)}
          disabled={phase === 'running'}
          aria-label="Import source"
          data={[
            {
              value: 'curl',
              label: (
                <Group gap={6} justify="center" wrap="nowrap">
                  <IconTerminal2 size={14} aria-hidden /> Paste cURL
                </Group>
              ),
            },
            {
              value: 'files',
              label: (
                <Group gap={6} justify="center" wrap="nowrap">
                  <IconFolderOpen size={14} aria-hidden /> Files or folders
                </Group>
              ),
            },
          ]}
        />

        {mode === 'curl' ? (
          <Stack gap="xs">
            <Textarea
              label="cURL command"
              description="Paste a command copied from a browser, the terminal or API documentation."
              placeholder={"curl https://api.example.com/users \\\n  -H 'Accept: application/json'"}
              autosize
              minRows={7}
              maxRows={14}
              value={curl}
              onChange={(event) => setCurl(event.currentTarget.value)}
              classNames={{ input: classes.code }}
              spellCheck={false}
              data-autofocus
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  importCurl();
                }
              }}
            />
            {parsed?.error && (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
                <Text size="xs">{parsed.error}</Text>
              </Alert>
            )}
            {parsed?.request && (
              <div className={classes.preview} aria-label="Request preview">
                <Text
                  span
                  fw={700}
                  size="xs"
                  c={`${methodColor[parsed.request.method]}.6`}
                  className={classes.method}
                >
                  {parsed.request.method}
                </Text>
                <Text span size="xs" className={classes.previewUrl} title={parsed.request.url}>
                  {parsed.request.url}
                </Text>
                <Text span size="xs" c="dimmed" className={classes.previewMeta}>
                  {[
                    parsed.request.headers.length &&
                      `${parsed.request.headers.length} header${parsed.request.headers.length === 1 ? '' : 's'}`,
                    parsed.request.body.mode !== 'none' && `${parsed.request.body.mode} body`,
                    parsed.request.auth.type !== 'none' && `${parsed.request.auth.type} auth`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </div>
            )}
          </Stack>
        ) : phase === 'running' ? (
          <Stack gap="xs" py="md" aria-live="polite">
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm" fw={600}>
                Importing {Math.min(progress.done + 1, progress.total)} of {progress.total}
              </Text>
            </Group>
            <Progress
              value={progress.total ? (progress.done / progress.total) * 100 : 0}
              size="sm"
              animated
              aria-label="Import progress"
            />
            {progress.current && (
              <Text size="xs" c="dimmed" className={classes.current} title={progress.current}>
                {progress.current}
              </Text>
            )}
          </Stack>
        ) : phase === 'done' ? (
          <Stack gap="sm">
            <Group gap="xs" aria-label="Import summary">
              <Badge color="teal" variant="light" leftSection={<IconCircleCheck size={12} />}>
                {counts.imported} imported
              </Badge>
              <Badge color="gray" variant="light" leftSection={<IconCircleMinus size={12} />}>
                {counts.skipped} skipped
              </Badge>
              <Badge color="red" variant="light" leftSection={<IconCircleX size={12} />}>
                {counts.failed} failed
              </Badge>
            </Group>
            <ul className={classes.results} aria-label="Import results">
              {[...results]
                .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
                .map((result) => {
                  const Icon = STATUS_ICON[result.status];
                  return (
                    <li key={result.path} className={classes.result} data-status={result.status}>
                      <Icon
                        size={16}
                        color={`var(--mantine-color-${STATUS_COLOR[result.status]}-6)`}
                        aria-label={result.status}
                      />
                      <div className={classes.resultText}>
                        <Group gap={6} wrap="nowrap">
                          <Text size="xs" fw={600} className={classes.path} title={result.path}>
                            {result.path}
                          </Text>
                          {result.format && (
                            <Badge size="xs" variant="default" radius="xs">
                              {FORMAT_LABEL[result.format]}
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c={result.status === 'failed' ? 'red' : 'dimmed'}>
                          {result.message}
                        </Text>
                        {result.warnings.map((warning) => (
                          <Text key={warning} size="xs" c="yellow.8">
                            {warning}
                          </Text>
                        ))}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </Stack>
        ) : (
          <Stack gap="sm">
            <div
              className={classes.dropzone}
              data-dragging={dragging || undefined}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => void onDrop(event)}
            >
              <IconFileImport size={28} className={classes.dropIcon} aria-hidden />
              <Text size="sm" fw={600}>
                Drop files or folders here
              </Text>
              <Text size="xs" c="dimmed" ta="center">
                OpenAPI 3.x and Swagger 2.0 (JSON or YAML), Postman collections and environments,
                .env files and HttpReq exports
              </Text>
              <Group gap="xs" mt={4}>
                <Button
                  variant="default"
                  leftSection={<IconFile size={14} />}
                  onClick={() => fileInput.current?.click()}
                >
                  Select files
                </Button>
                <Button
                  variant="default"
                  leftSection={<IconFolderOpen size={14} />}
                  onClick={() => folderInput.current?.click()}
                >
                  Select folder
                </Button>
              </Group>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                accept={SUPPORTED_ACCEPT}
                aria-label="Select files to import"
                onChange={(event) => {
                  add(sourcesFromFileList(event.currentTarget.files));
                  event.currentTarget.value = '';
                }}
              />
              <input
                ref={(element) => {
                  folderInput.current = element;
                  // Not in React's attribute list; it turns the picker into a folder picker.
                  element?.setAttribute('webkitdirectory', '');
                }}
                type="file"
                multiple
                hidden
                aria-label="Select a folder to import"
                onChange={(event) => {
                  add(sourcesFromFileList(event.currentTarget.files));
                  event.currentTarget.value = '';
                }}
              />
            </div>

            {files.length > 0 && (
              <Stack gap={4}>
                <Group justify="space-between">
                  <Text size="xs" fw={600}>
                    {files.length} file{files.length === 1 ? '' : 's'} selected
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => setFiles([])}
                  >
                    Clear
                  </Button>
                </Group>
                <ul className={classes.fileList} aria-label="Files to import">
                  {files.map((file) => (
                    <li key={file.path} className={classes.fileRow}>
                      <IconFile size={14} aria-hidden />
                      <Text size="xs" className={classes.path} title={file.path}>
                        {file.path}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatSize(file.size)}
                      </Text>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="xs"
                        aria-label={`Remove ${file.path}`}
                        onClick={() =>
                          setFiles((current) => current.filter((item) => item.path !== file.path))
                        }
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    </li>
                  ))}
                </ul>
              </Stack>
            )}

            <Select
              size="xs"
              label="When an environment with the same name already exists"
              data={CONFLICT_OPTIONS}
              value={conflict}
              allowDeselect={false}
              onChange={(value) => value && setConflict(value as EnvironmentConflict)}
            />
          </Stack>
        )}
      </Stack>
    </AppModal>
  );
}
