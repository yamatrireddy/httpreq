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
            Configure a request above and select Send.
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Tabs defaultValue="body" h="100%" className="response-tabs">
      <Group justify="space-between" px="md" className="response-heading">
        <Tabs.List>
          <Tabs.Tab value="body">Body</Tabs.Tab>
          <Tabs.Tab value="headers">Headers ({Object.keys(response.headers).length})</Tabs.Tab>
        </Tabs.List>
        <Group gap="xs">
          <Badge color={response.status < 400 ? 'teal' : 'red'} variant="light">
            {response.status} {response.statusText}
          </Badge>
          <Badge color="gray" variant="light" leftSection={<IconClock size={12} />}>
            {response.durationMs} ms
          </Badge>
          <Badge color="gray" variant="light" leftSection={<IconDatabase size={12} />}>
            {formatBytes(response.sizeBytes)}
          </Badge>
        </Group>
      </Group>
      <Tabs.Panel value="body" h="calc(100% - 42px)">
        <Group justify="flex-end" px="md" py={6}>
          <SegmentedControl size="xs" value={view} onChange={setView} data={['pretty', 'raw']} />
        </Group>
        <Box h="calc(100% - 42px)" className="editor-frame">
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
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
              }}
            />
          </Suspense>
        </Box>
      </Tabs.Panel>
      <Tabs.Panel value="headers" p="md">
        <Table striped highlightOnHover withTableBorder>
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
