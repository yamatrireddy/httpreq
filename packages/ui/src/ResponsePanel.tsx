import {
  Badge,
  Center,
  Loader,
  SegmentedControl,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { useComputedColorScheme } from '@mantine/core';
import { IconBraces, IconClock, IconDatabase } from '@tabler/icons-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { HttpResponse } from '@httpreq/shared';
import { EditorLoading } from './editor/EditorLoading';
import { prettyBody, WORKER_FORMAT_THRESHOLD } from './prettyBody';
import { prettyText, type PrettyKind, type PrettyResult } from './prettyText';
import { ScrollableTabsList } from './ScrollableTabsList';
import classes from './ResponsePanel.module.css';

const ResponseViewer = lazy(() => import('./ResponseViewer'));

/**
 * From this size the viewer drops line wrapping and folding. Wrapping makes the editor compute
 * the break points of every line up front, and a minified multi-megabyte body is one enormous
 * line; both features are what made large responses freeze the window.
 */
export const LARGE_BODY_CHARS = 2 * 1024 * 1024;
/** From this size the body is shown as plain text, without JSON highlighting and validation. */
export const PLAIN_TEXT_CHARS = 16 * 1024 * 1024;

const formatBytes = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Formatted bodies, per response, so switching tabs or views never formats one twice. */
const formatted = new WeakMap<HttpResponse, PrettyResult>();

/** A stable id per response object, naming its documents in the viewer. */
const responseIds = new WeakMap<HttpResponse, number>();
let nextResponseId = 0;
const responseId = (response: HttpResponse) => {
  let id = responseIds.get(response);
  if (id === undefined) {
    id = ++nextResponseId;
    responseIds.set(response, id);
  }
  return id;
};

type BodyView = 'pretty' | 'raw';
type ResponseTab = 'body' | 'headers';

const DEFAULT_OPTIONS = { wordWrap: 'on', folding: true } as const;
const LARGE_OPTIONS = { wordWrap: 'off', folding: false } as const;

/** The structured format a content type can be pretty-printed as, if any. */
const prettyKind = (contentType: string): PrettyKind | null =>
  /json/i.test(contentType) ? 'json' : /xml/i.test(contentType) ? 'xml' : null;

/**
 * The formatted body for the Pretty view: small bodies are formatted during render (faster than a
 * round trip, with no loader flash), large ones in a worker. `null` means that is still running.
 */
function usePrettyBody(response: HttpResponse | undefined, kind: PrettyKind | null) {
  const wanted = !!response && kind !== null;
  const small = !!response && response.body.length < WORKER_FORMAT_THRESHOLD;
  const [done, setDone] = useState<{ response: HttpResponse; result: PrettyResult } | null>(null);

  const inline = useMemo(() => {
    if (!response || !kind || !small) return null;
    const cached = formatted.get(response);
    if (cached) return cached;
    const result = prettyText(response.body, kind);
    formatted.set(response, result);
    return result;
  }, [response, small, kind]);

  useEffect(() => {
    if (!response || !kind || small || formatted.has(response)) return;
    let live = true;
    void prettyBody(response.body, kind).then((result) => {
      formatted.set(response, result);
      if (live) setDone({ response, result });
    });
    return () => {
      live = false;
    };
  }, [response, small, kind]);

  if (!response || !wanted) return null;
  if (inline) return inline;
  return done?.response === response ? done.result : (formatted.get(response) ?? null);
}

export function ResponsePanel({
  response,
  loading,
}: {
  response?: HttpResponse;
  loading: boolean;
}) {
  const colorScheme = useComputedColorScheme('dark');
  const [view, setView] = useState<BodyView>('pretty');
  const [tab, setTab] = useState<ResponseTab>('body');
  const kind = response ? prettyKind(response.contentType) : null;
  // Formatting starts as soon as a response arrives, so the Pretty view is ready when asked for.
  const pretty = usePrettyBody(response, kind);

  if (!response) {
    return (
      <Center h="100%">
        <Stack align="center" gap="xs">
          <ThemeIcon variant="light" size={44} radius="xl">
            <IconBraces size={22} />
          </ThemeIcon>
          <Text fw={600}>{loading ? 'Sending request…' : 'Response will appear here'}</Text>
          <Text size="sm" c="dimmed">
            Configure the request and select Send.
          </Text>
        </Stack>
      </Center>
    );
  }

  const wantsPretty = kind !== null && view === 'pretty';
  // While a large body is being formatted, the raw text stays on screen under a loader.
  const formatting = wantsPretty && pretty === null;
  const showPretty = wantsPretty && pretty !== null && pretty.ok;
  const displayed = showPretty ? pretty.text : response.body;
  const size = displayed.length;
  const large = size >= LARGE_BODY_CHARS;
  const headerCount = Object.keys(response.headers).length;
  const id = responseId(response);
  const language =
    size >= PLAIN_TEXT_CHARS || !kind ? 'plaintext' : kind === 'json' ? 'json' : 'xml';

  return (
    <Tabs
      value={tab}
      onChange={(value) => value && setTab(value as ResponseTab)}
      // The body viewer stays mounted on the Headers tab, so coming back does not rebuild it.
      keepMounted
      className={classes.root}
    >
      {/*
       * One strip holds the tabs, the body view switch and the summary, so the content starts
       * right under it. The view switch keeps its slot on the Headers tab too (hidden), so
       * switching tabs never moves anything.
       */}
      <div className={classes.heading}>
        <ScrollableTabsList active={tab} frameClassName={classes.tabFrame} aria-label="Response">
          <Tabs.Tab value="body">Body</Tabs.Tab>
          <Tabs.Tab value="headers">
            Headers <span className={classes.count}>{headerCount}</span>
          </Tabs.Tab>
        </ScrollableTabsList>
        <div className={classes.tools}>
          {kind && (
            <SegmentedControl
              size="xs"
              value={view}
              onChange={(value) => setView(value as BodyView)}
              data={[
                { value: 'pretty', label: 'Pretty' },
                { value: 'raw', label: 'Raw' },
              ]}
              aria-label="Body view"
              className={classes.viewSwitch}
              data-hidden={tab !== 'body' || undefined}
            />
          )}
          <div className={classes.meta} aria-label="Response summary">
            <Badge color={response.status < 400 ? 'teal' : 'red'} variant="light" radius="xs">
              {response.status} {response.statusText}
            </Badge>
            <Badge color="gray" variant="light" radius="xs" leftSection={<IconClock size={12} />}>
              {response.durationMs} ms
            </Badge>
            <Badge
              color="gray"
              variant="light"
              radius="xs"
              leftSection={<IconDatabase size={12} />}
            >
              {formatBytes(response.sizeBytes)}
            </Badge>
          </div>
        </div>
      </div>

      <Tabs.Panel value="body" className={classes.bodyPanel}>
        {large && (
          <Text size="xs" c="dimmed" className={classes.notice}>
            Large response ({formatBytes(response.sizeBytes)}): line wrapping and folding are off
            {size >= PLAIN_TEXT_CHARS ? ', and so is highlighting' : ''}, to keep scrolling smooth.
          </Text>
        )}
        {wantsPretty && pretty && !pretty.ok && (
          <Text size="xs" c="dimmed" className={classes.notice} role="status">
            The body is not valid {kind === 'json' ? 'JSON' : 'XML'}, so it is shown as received.
          </Text>
        )}
        <div className={`editor-frame ${classes.editor}`}>
          <Suspense fallback={<EditorLoading />}>
            <ResponseViewer
              documentKey={`${id}:${showPretty ? 'pretty' : 'raw'}`}
              group={String(id)}
              value={displayed}
              language={language}
              theme={colorScheme === 'dark' ? 'vs-dark' : 'light'}
              options={large ? LARGE_OPTIONS : DEFAULT_OPTIONS}
            />
          </Suspense>
          {formatting && (
            <Center className={classes.formatting}>
              <Loader size="sm" aria-label="Formatting the response" />
              <Text size="xs" c="dimmed">
                Formatting {formatBytes(response.sizeBytes)}…
              </Text>
            </Center>
          )}
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="headers" className={classes.headersPanel}>
        <Table striped highlightOnHover withTableBorder className="hr-mono">
          <Table.Tbody>
            {Object.entries(response.headers).map(([key, value]) => (
              <Table.Tr key={key}>
                <Table.Td fw={600}>{key}</Table.Td>
                <Table.Td>{value}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Tabs.Panel>
    </Tabs>
  );
}
