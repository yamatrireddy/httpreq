import { Box, Center, Loader, SegmentedControl, Tabs, Text } from '@mantine/core';
import { useComputedColorScheme } from '@mantine/core';
import type { HttpRequest } from '@httpreq/shared';
import { lazy, Suspense } from 'react';
import { AuthEditor } from './AuthEditor';
import { KeyValueEditor } from './KeyValueEditor';

const Editor = lazy(() => import('./LocalEditor'));

interface Props {
  request: HttpRequest;
  onChange: (patch: Partial<HttpRequest>) => void;
}

export function RequestConfig({ request, onChange }: Props) {
  const colorScheme = useComputedColorScheme('dark');
  return (
    <Tabs defaultValue="params" className="request-config">
      <Tabs.List px="md">
        <Tabs.Tab value="params">
          Params {request.params.length ? `(${request.params.length})` : ''}
        </Tabs.Tab>
        <Tabs.Tab value="headers">
          Headers {request.headers.length ? `(${request.headers.length})` : ''}
        </Tabs.Tab>
        <Tabs.Tab value="body">Body</Tabs.Tab>
        <Tabs.Tab value="auth">Auth</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="params" p="md">
        <KeyValueEditor items={request.params} onChange={(params) => onChange({ params })} />
      </Tabs.Panel>
      <Tabs.Panel value="headers" p="md">
        <KeyValueEditor items={request.headers} onChange={(headers) => onChange({ headers })} />
      </Tabs.Panel>
      <Tabs.Panel value="body" p="md">
        <SegmentedControl
          mb="sm"
          value={request.body.type}
          onChange={(type) =>
            onChange({
              body:
                type === 'json'
                  ? { type, content: request.body.content }
                  : { type: 'none', content: '' },
            })
          }
          data={[
            { label: 'None', value: 'none' },
            { label: 'JSON', value: 'json' },
          ]}
        />
        {request.body.type === 'json' ? (
          <Box h={230} className="editor-frame">
            <Suspense
              fallback={
                <Center h="100%">
                  <Loader size="sm" />
                </Center>
              }
            >
              <Editor
                language="json"
                theme={colorScheme === 'dark' ? 'vs-dark' : 'light'}
                value={request.body.content}
                onChange={(content) => onChange({ body: { type: 'json', content: content ?? '' } })}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                  automaticLayout: true,
                }}
              />
            </Suspense>
          </Box>
        ) : (
          <Text c="dimmed" size="sm">
            This request has no body.
          </Text>
        )}
      </Tabs.Panel>
      <Tabs.Panel value="auth" p="md">
        <AuthEditor auth={request.auth} onChange={(auth) => onChange({ auth })} />
      </Tabs.Panel>
    </Tabs>
  );
}
