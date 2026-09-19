import { Badge, SimpleGrid, Stack, Text, Textarea } from '@mantine/core';
import { authProviders, type EffectiveAuth } from '@httpreq/api-client';
import type { HistoryEntry, HttpRequest } from '@httpreq/shared';
import { methodColor } from '../methods';
import classes from './RequestEditor.module.css';

const BODY_LABELS: Record<HttpRequest['body']['mode'], string> = {
  none: 'None',
  json: 'JSON',
  text: 'Text',
  'form-urlencoded': 'Form URL Encoded',
  multipart: 'Multipart Form',
  binary: 'Binary file',
};

interface Props {
  request: HttpRequest;
  location: string;
  environmentName: string | null;
  effectiveAuth: EffectiveAuth;
  lastRun?: HistoryEntry;
  paramCount: number;
  headerCount: number;
  onChange: (patch: Partial<HttpRequest>) => void;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={classes.overviewItem}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <div className={classes.overviewValue}>{children}</div>
    </div>
  );
}

/** A compact summary of the request, not a second editor. */
export function OverviewPanel({
  request,
  location,
  environmentName,
  effectiveAuth,
  lastRun,
  paramCount,
  headerCount,
  onChange,
}: Props) {
  const authLabel =
    request.auth.type === 'inherit'
      ? `${authProviders[effectiveAuth.auth.type].label} (inherited${
          effectiveAuth.source.kind === 'none' ? '' : ` from ${effectiveAuth.source.name}`
        })`
      : authProviders[request.auth.type].label;

  return (
    <Stack gap="md" maw={820}>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm" verticalSpacing="sm">
        <Item label="Name">
          <Text size="sm" fw={600} truncate>
            {request.name}
          </Text>
        </Item>
        <Item label="Method">
          <Text size="sm" fw={700} c={`${methodColor[request.method]}.6`}>
            {request.method}
          </Text>
        </Item>
        <Item label="Location">
          <Text size="sm" truncate title={location}>
            {location}
          </Text>
        </Item>
        <Item label="URL">
          <Text size="sm" ff="monospace" className={classes.breakAll}>
            {request.url || '—'}
          </Text>
        </Item>
        <Item label="Environment">
          <Text size="sm">{environmentName ?? 'No environment'}</Text>
        </Item>
        <Item label="Authorization">
          <Text size="sm">{authLabel}</Text>
        </Item>
        <Item label="Query parameters">
          <Text size="sm">{paramCount}</Text>
        </Item>
        <Item label="Headers">
          <Text size="sm">{headerCount}</Text>
        </Item>
        <Item label="Body">
          <Text size="sm">{BODY_LABELS[request.body.mode]}</Text>
        </Item>
        <Item label="Last sent">
          <Text size="sm">{lastRun ? new Date(lastRun.timestamp).toLocaleString() : 'Never'}</Text>
        </Item>
        <Item label="Last response">
          {lastRun ? (
            lastRun.status !== null ? (
              <Badge variant="light" radius="xs" color={lastRun.status < 400 ? 'teal' : 'red'}>
                {lastRun.status} {lastRun.statusText} · {lastRun.durationMs} ms
              </Badge>
            ) : (
              <Text size="sm" c="red" truncate title={lastRun.error}>
                Failed: {lastRun.error}
              </Text>
            )
          ) : (
            <Text size="sm">—</Text>
          )}
        </Item>
      </SimpleGrid>
      <Textarea
        label="Description"
        placeholder="What this request does, expected inputs, notes for teammates…"
        value={request.description}
        onChange={(event) => onChange({ description: event.currentTarget.value })}
        autosize
        minRows={2}
        maxRows={8}
      />
    </Stack>
  );
}
