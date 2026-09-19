import { Box, Center, Loader, SegmentedControl, Tabs, Text } from '@mantine/core';
import { useComputedColorScheme } from '@mantine/core';
import type { HttpRequest } from '@httpreq/shared';
import { lazy, Suspense } from 'react';
import { AuthEditor } from './AuthEditor';
import { KeyValueEditor } from './KeyValueEditor';
import { MONO_FONT_FAMILY } from './theme';
import classes from './RequestConfig.module.css';

const Editor = lazy(() => import('./LocalEditor'));

interface Props {
  request: HttpRequest;
  onChange: (patch: Partial<HttpRequest>) => void;
}

export function RequestConfig({ request, onChange }: Props) {
  const colorScheme = useComputedColorScheme('dark');
  return (
    <Tabs defaultValue="params" className={`request-config ${classes.root}`}>
      <Tabs.List px="sm" className={classes.list}>
        <Tabs.Tab value="params">
          Params {request.params.length ? `(${request.params.length})` : ''}
        </Tabs.Tab>
        <Tabs.Tab value="headers">
          Headers {request.headers.length ? `(${request.headers.length})` : ''}
        </Tabs.Tab>
        <Tabs.Tab value="body">Body</Tabs.Tab>
        <Tabs.Tab value="auth">Auth</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="params" p="sm" className={classes.panel}>
        <KeyValueEditor items={request.params} onChange={(params) => onChange({ params })} />
      </Tabs.Panel>
      <Tabs.Panel value="headers" p="sm" className={classes.panel}>
        <KeyValueEditor items={request.headers} onChange={(headers) => onChange({ headers })} />
      </Tabs.Panel>
      <Tabs.Panel value="body" p="sm" className={`${classes.panel} ${classes.bodyPanel}`}>
        <SegmentedControl
          mb="sm"
          size="xs"
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
          <Box className={`editor-frame ${classes.editor}`}>
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
                  fontFamily: MONO_FONT_FAMILY,
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
      <Tabs.Panel value="auth" p="sm" className={classes.panel}>
        <AuthEditor auth={request.auth} onChange={(auth) => onChange({ auth })} />
      </Tabs.Panel>
    </Tabs>
  );
}
