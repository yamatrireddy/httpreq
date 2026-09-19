import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
  Button,
  Divider,
  Group,
  NavLink,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import {
  IconApi,
  IconBolt,
  IconFolder,
  IconHistory,
  IconMoon,
  IconPlus,
  IconServer,
  IconSettings,
  IconSun,
  IconVariable,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { HttpMethod, HttpRequest, HttpRuntime } from '@httpreq/shared';
import { AppError } from '@httpreq/shared';
import type { WorkspaceRepository } from '@httpreq/shared';
import { DEFAULT_WORKSPACE_ID } from '@httpreq/workspace';
import { RequestConfig } from './RequestConfig';
import { ResponsePanel } from './ResponsePanel';
import { useWorkbenchStore } from './store';
import classes from './HttpReqApp.module.css';

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const methodColor: Record<HttpMethod, string> = {
  GET: 'teal',
  POST: 'blue',
  PUT: 'yellow',
  PATCH: 'orange',
  DELETE: 'red',
};

const sidebarItems = [
  { label: 'Collections', icon: IconFolder, active: true },
  { label: 'Environments', icon: IconVariable },
  { label: 'History', icon: IconHistory },
  { label: 'WebSockets', icon: IconBolt, soon: true },
  { label: 'SSH', icon: IconServer, soon: true },
];

interface Props {
  runtime: HttpRuntime;
  repository: WorkspaceRepository;
}

export function HttpReqApp({ runtime, repository }: Props) {
  const [opened, { toggle }] = useDisclosure();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const {
    workspace,
    activeRequestId,
    responses,
    setWorkspace,
    setActiveRequest,
    updateRequest,
    addRequest,
    closeRequest,
    setResponse,
  } = useWorkbenchStore();
  const request = useMemo(
    () => workspace.requests.find((item) => item.id === activeRequestId),
    [workspace.requests, activeRequestId],
  );

  useEffect(() => {
    repository.getWorkspace(DEFAULT_WORKSPACE_ID).then((saved) => saved && setWorkspace(saved));
  }, [repository, setWorkspace]);

  useEffect(() => {
    const handle = window.setTimeout(() => void repository.saveWorkspace(workspace), 250);
    return () => window.clearTimeout(handle);
  }, [repository, workspace]);

  const send = async () => {
    if (!request || !request.url.trim()) {
      notifications.show({
        color: 'red',
        title: 'URL required',
        message: 'Enter an absolute URL before sending.',
      });
      return;
    }
    abortRef.current = new AbortController();
    setSending(true);
    try {
      setResponse(request.id, await runtime.execute(request, abortRef.current.signal));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        notifications.show({ color: 'yellow', message: 'Request cancelled.' });
      } else {
        const message = error instanceof AppError ? error.message : 'An unexpected error occurred.';
        notifications.show({ color: 'red', title: 'Request failed', message });
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  if (!request) return null;
  const patch = (value: Partial<HttpRequest>) => updateRequest(request.id, value);

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding={0}
    >
      <AppShell.Header className={classes.header}>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Box className={classes.logo}>
              <IconApi size={19} stroke={2.2} />
            </Box>
            <Text fw={750} size="lg">
              HttpReq
            </Text>
            <Badge variant="light" color="gray" size="xs">
              {runtime.kind}
            </Badge>
          </Group>
          <Group gap="xs">
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {workspace.name}
            </Text>
            <Tooltip label="Toggle color scheme">
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => toggleColorScheme()}
                aria-label="Toggle color scheme"
              >
                {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
            <ActionIcon variant="subtle" color="gray" aria-label="Settings">
              <IconSettings size={18} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" className={classes.navbar}>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" py="xs">
          Workspace
        </Text>
        <Stack gap={2}>
          {sidebarItems.map((item) => (
            <NavLink
              key={item.label}
              label={item.label}
              active={item.active}
              leftSection={<item.icon size={17} />}
              rightSection={
                item.soon ? (
                  <Badge size="xs" variant="light" color="gray">
                    Soon
                  </Badge>
                ) : undefined
              }
              disabled={item.soon}
            />
          ))}
        </Stack>
        <Divider my="sm" />
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" py="xs">
          Requests
        </Text>
        <Stack gap={2} className={classes.requestList}>
          {workspace.requests.map((item) => (
            <NavLink
              key={item.id}
              label={item.name}
              active={item.id === request.id}
              onClick={() => setActiveRequest(item.id)}
              leftSection={
                <Text size="xs" fw={800} c={methodColor[item.method]}>
                  {item.method}
                </Text>
              }
            />
          ))}
        </Stack>
        <Button
          mt="sm"
          variant="subtle"
          color="gray"
          leftSection={<IconPlus size={15} />}
          onClick={addRequest}
        >
          New request
        </Button>
      </AppShell.Navbar>

      <AppShell.Main className={classes.main}>
        <Tabs
          value={activeRequestId}
          onChange={(id) => id && setActiveRequest(id)}
          variant="outline"
          className={classes.requestTabs}
        >
          <Group gap={0} wrap="nowrap">
            <Tabs.List className={classes.tabList}>
              {workspace.requests.map((item) => (
                <Tabs.Tab
                  key={item.id}
                  value={item.id}
                  rightSection={
                    workspace.requests.length > 1 ? (
                      <ActionIcon
                        component="span"
                        size="xs"
                        variant="transparent"
                        color="gray"
                        onClick={(event) => {
                          event.stopPropagation();
                          closeRequest(item.id);
                        }}
                      >
                        <IconX size={13} />
                      </ActionIcon>
                    ) : undefined
                  }
                >
                  <Group gap={6}>
                    <Text size="xs" fw={800} c={methodColor[item.method]}>
                      {item.method}
                    </Text>
                    <Text size="sm">{item.name}</Text>
                  </Group>
                </Tabs.Tab>
              ))}
            </Tabs.List>
            <Tooltip label="New request">
              <ActionIcon ml="xs" variant="subtle" color="gray" onClick={addRequest}>
                <IconPlus size={17} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Tabs>

        <Box className={classes.requestArea}>
          <Group gap="xs" p="md" wrap="nowrap">
            <Select
              aria-label="HTTP method"
              w={118}
              value={request.method}
              data={methods}
              allowDeselect={false}
              onChange={(method) => patch({ method: method as HttpMethod })}
              styles={{
                input: {
                  color: `var(--mantine-color-${methodColor[request.method]}-6)`,
                  fontWeight: 700,
                },
              }}
            />
            <TextInput
              aria-label="Request URL"
              placeholder="https://api.example.com/users"
              value={request.url}
              onChange={(event) => patch({ url: event.currentTarget.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void send();
              }}
              style={{ flex: 1 }}
            />
            {sending ? (
              <Button color="red" variant="light" onClick={() => abortRef.current?.abort()}>
                Cancel
              </Button>
            ) : (
              <Button onClick={() => void send()}>Send</Button>
            )}
          </Group>
          <RequestConfig request={request} onChange={patch} />
        </Box>
        <Box className={classes.responseArea}>
          <ResponsePanel response={responses[request.id]} loading={sending} />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
