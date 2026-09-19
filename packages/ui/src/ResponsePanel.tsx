import {
  Badge,
  Box,
  Center,
  Group,
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
import { lazy, Suspense, useMemo, useState } from 'react';
import type { HttpResponse } from '@httpreq/shared';
import { MONO_FONT_FAMILY } from './theme';
import classes from './ResponsePanel.module.css';

const Editor = lazy(() => import('./LocalEditor'));

const formatBytes = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

export function ResponsePanel({
  response,
  loading,
}: {
  response?: HttpResponse;
  loading: boolean;
}) {
  const colorScheme = useComputedColorScheme('dark');
  const [view, setView] = useState('pretty');
  const displayedBody = useMemo(() => {
    if (!response || view === 'raw') return response?.body ?? '';
    if (response.contentType.includes('json')) {
      try {
        return JSON.stringify(JSON.parse(response.body), null, 2);
      } catch {
        return response.body;
      }
    }
    return response.body;
  }, [response, view]);

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

  return (
    <Tabs defaultValue="body" className={`response-tabs ${classes.root}`}>
      <Group justify="space-between" px="sm" gap="xs" wrap="nowrap" className="response-heading">
        <Tabs.List>
          <Tabs.Tab value="body">Body</Tabs.Tab>
          <Tabs.Tab value="headers">Headers ({Object.keys(response.headers).length})</Tabs.Tab>
        </Tabs.List>
        <Group gap={6} wrap="nowrap" className={classes.meta} aria-label="Response summary">
          <Badge color={response.status < 400 ? 'teal' : 'red'} variant="light" radius="xs">
            {response.status} {response.statusText}
          </Badge>
          <Badge color="gray" variant="light" radius="xs" leftSection={<IconClock size={12} />}>
            {response.durationMs} ms
          </Badge>
          <Badge color="gray" variant="light" radius="xs" leftSection={<IconDatabase size={12} />}>
            {formatBytes(response.sizeBytes)}
          </Badge>
        </Group>
      </Group>
      <Tabs.Panel value="body" className={classes.bodyPanel}>
        <Group justify="flex-end" px="sm" py={6}>
          <SegmentedControl
            size="xs"
            value={view}
            onChange={setView}
            data={['pretty', 'raw']}
            aria-label="Body view"
          />
        </Group>
        <Box className={`editor-frame ${classes.editor}`}>
          <Suspense
            fallback={
              <Center h="100%">
                <Loader size="sm" />
              </Center>
            }
          >
            <Editor
              language={response.contentType.includes('json') ? 'json' : 'text'}
              theme={colorScheme === 'dark' ? 'vs-dark' : 'light'}
              value={displayedBody}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: MONO_FONT_FAMILY,
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
              }}
            />
          </Suspense>
        </Box>
      </Tabs.Panel>
      <Tabs.Panel value="headers" p="sm" className={classes.headersPanel}>
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
