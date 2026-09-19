import {
  AppShell,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  NavLink,
  Select,
  Stack,
  Text,
  TextInput,
  useMantineColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBolt,
  IconFolder,
  IconHistory,
  IconPlus,
  IconServer,
  IconVariable,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DOCUMENTATION_URL,
  type DesktopBridge,
  type HttpMethod,
  type HttpRequest,
  type HttpRuntime,
  type MenuCommand,
  type WorkspaceRepository,
} from '@httpreq/shared';
import { DEFAULT_WORKSPACE_ID } from '@httpreq/workspace';
import './app.css';
import type { CommandMap } from './commands';
import { useShortcutManager } from './commands';
import {
  browserConnectivityProbe,
  reportRequestConnectivity,
  useConnectivityMonitor,
} from './connectivity';
import { AboutDialog, SettingsDialog, ShortcutsDialog } from './Dialogs';
import { LayoutToggle } from './LayoutToggle';
import type { MenuDefinition } from './MenuBar';
import { methodColor, methods, REQUEST_PANEL_ID, requestTabId } from './methods';
import { DEFAULT_SPLIT_RATIO, usePreferences } from './preferences';
import { RequestConfig } from './RequestConfig';
import { RequestTabs } from './RequestTabs';
import { ResponsePanel } from './ResponsePanel';
import { formatChord } from './shortcuts';
import { SplitPane } from './SplitPane';
import { StatusBar } from './StatusBar';
import { useWorkbenchStore } from './store';
import { TitleBar } from './TitleBar';
import { useRequestExecution } from './useRequestExecution';
import classes from './HttpReqApp.module.css';

const sidebarItems = [
  { label: 'Collections', icon: IconFolder, active: true },
  { label: 'Environments', icon: IconVariable },
  { label: 'History', icon: IconHistory },
  { label: 'WebSockets', icon: IconBolt, soon: true },
  { label: 'SSH', icon: IconServer, soon: true },
];

/** Must match the Electron window-controls overlay height (`TITLE_BAR_HEIGHT` in desktop). */
const TITLE_BAR_HEIGHT = 36;
const STATUS_BAR_HEIGHT = 24;
const NETWORK_ERRORS = new Set(['NETWORK_ERROR', 'DNS_ERROR', 'CONNECTION_TIMEOUT']);

type Dialog = 'settings' | 'shortcuts' | 'about';

interface Props {
  runtime: HttpRuntime;
  repository: WorkspaceRepository;
  /** Desktop shell bridge; absent in the browser. */
  desktop?: DesktopBridge;
  version?: string;
}

const menus: MenuDefinition[] = [
  {
    label: 'File',
    mnemonic: 'f',
    entries: [
      { command: 'request.new' },
      { separator: true },
      { command: 'request.save' },
      { separator: true },
      { command: 'request.close' },
      { separator: true },
      { command: 'app.exit' },
    ],
  },
  {
    label: 'Edit',
    mnemonic: 'e',
    entries: [
      { command: 'edit.undo' },
      { command: 'edit.redo' },
      { separator: true },
      { command: 'edit.cut' },
      { command: 'edit.copy' },
      { command: 'edit.paste' },
      { separator: true },
      { command: 'edit.select-all' },
    ],
  },
  {
    label: 'View',
    mnemonic: 'v',
    entries: [
      { command: 'view.response-right', role: 'radio' },
      { command: 'view.response-bottom', role: 'radio' },
      { separator: true },
      { command: 'view.toggle-sidebar', role: 'checkbox' },
      { command: 'view.toggle-status-bar', role: 'checkbox' },
      { command: 'view.toggle-theme' },
      { separator: true },
      { command: 'view.zoom-in' },
      { command: 'view.zoom-out' },
      { command: 'view.zoom-reset' },
      { separator: true },
      { command: 'view.fullscreen' },
    ],
  },
  {
    label: 'Request',
    mnemonic: 'r',
    entries: [
      { command: 'request.send' },
      { command: 'request.send-focus' },
      { separator: true },
      { command: 'request.save' },
      { command: 'request.duplicate' },
      { separator: true },
      { command: 'request.next' },
      { command: 'request.previous' },
      { separator: true },
      { command: 'request.close' },
    ],
  },
  { label: 'Tools', mnemonic: 't', entries: [{ command: 'tools.settings' }] },
  {
    label: 'Help',
    mnemonic: 'h',
    entries: [
      { command: 'help.documentation' },
      { command: 'help.shortcuts' },
      { separator: true },
      { command: 'help.devtools' },
      { separator: true },
      { command: 'help.about' },
    ],
  },
];

export function HttpReqApp({ runtime, repository, desktop, version }: Props) {
  const [opened, { toggle, close: closeNav }] = useDisclosure();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const { toggleColorScheme } = useMantineColorScheme();
  const {
    workspace,
    activeRequestId,
    responses,
    unsavedIds,
    setWorkspace,
    setActiveRequest,
    cycleRequest,
    updateRequest,
    addRequest,
    duplicateRequest,
    moveRequest,
    closeRequest,
    setResponse,
    markSaved,
  } = useWorkbenchStore();
  const responsePosition = usePreferences((state) => state.responsePosition);
  const splitRatio = usePreferences((state) => state.splitRatio[state.responsePosition]);
  const setSplitRatio = usePreferences((state) => state.setSplitRatio);
  const sidebarVisible = usePreferences((state) => state.sidebarVisible);
  const statusBarVisible = usePreferences((state) => state.statusBarVisible);
  const setResponsePosition = usePreferences((state) => state.setResponsePosition);
  const toggleSidebar = usePreferences((state) => state.toggleSidebar);
  const toggleStatusBar = usePreferences((state) => state.toggleStatusBar);
  const execution = useRequestExecution(runtime, setResponse);
  const { send: executeRequest, cancel: cancelRequest } = execution;
  const responseRef = useRef<HTMLElement>(null);
  const request = useMemo(
    () => workspace.requests.find((item) => item.id === activeRequestId),
    [workspace.requests, activeRequestId],
  );
  const mac = useMemo(
    () =>
      desktop
        ? desktop.platform === 'darwin'
        : typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent),
    [desktop],
  );

  const probe = useMemo(
    () => (desktop ? () => desktop.checkConnectivity() : browserConnectivityProbe),
    [desktop],
  );
  useConnectivityMonitor(probe);

  useEffect(() => {
    repository.getWorkspace(DEFAULT_WORKSPACE_ID).then((saved) => saved && setWorkspace(saved));
  }, [repository, setWorkspace]);

  const persist = useCallback(
    (snapshot: typeof workspace) =>
      repository.saveWorkspace(snapshot).then(
        () => markSaved(snapshot),
        // Leave the unsaved marker in place; the next edit or Save retries.
        () => undefined,
      ),
    [repository, markSaved],
  );

  const pendingSave = useRef<number | undefined>(undefined);
  useEffect(() => {
    const handle = window.setTimeout(() => void persist(workspace), 250);
    pendingSave.current = handle;
    return () => window.clearTimeout(handle);
  }, [persist, workspace]);

  /** Writes the workspace immediately instead of waiting for the autosave debounce. */
  const saveNow = useCallback(() => {
    window.clearTimeout(pendingSave.current);
    void persist(useWorkbenchStore.getState().workspace);
  }, [persist]);

  const send = useCallback(
    async (focusResponse = false) => {
      const { workspace: current, activeRequestId: activeId } = useWorkbenchStore.getState();
      const target = current.requests.find((item) => item.id === activeId);
      if (!target || !target.url.trim()) {
        notifications.show({
          color: 'red',
          title: 'URL required',
          message: 'Enter an absolute URL before sending.',
        });
        return;
      }
      if (focusResponse) responseRef.current?.focus();
      const outcome = await executeRequest(target);
      if (outcome.kind === 'success') {
        reportRequestConnectivity('success');
      } else if (outcome.kind === 'cancelled') {
        notifications.show({ color: 'yellow', message: 'Request cancelled.' });
      } else {
        if (outcome.code && NETWORK_ERRORS.has(outcome.code)) {
          reportRequestConnectivity('network-error');
        }
        notifications.show({ color: 'red', title: 'Request failed', message: outcome.message });
      }
    },
    [executeRequest],
  );

  const closeActiveRequest = useCallback(
    (id: string) => {
      cancelRequest(id);
      closeRequest(id);
    },
    [cancelRequest, closeRequest],
  );

  const openDocumentation = useCallback(() => {
    if (desktop) desktop.openExternal(DOCUMENTATION_URL);
    else window.open(DOCUMENTATION_URL, '_blank', 'noopener,noreferrer');
  }, [desktop]);

  const requestCount = workspace.requests.length;
  const commands = useMemo<CommandMap>(() => {
    const active = () => useWorkbenchStore.getState().activeRequestId;
    const map: CommandMap = {
      'request.new': { label: 'New Request', shortcut: [{ key: 't', mod: true }], run: addRequest },
      'request.save': { label: 'Save', shortcut: [{ key: 's', mod: true }], run: saveNow },
      'request.close': {
        label: 'Close Request',
        shortcut: [{ key: 'w', mod: true }],
        run: () => closeActiveRequest(active()),
        disabled: requestCount <= 1,
      },
      'request.send': {
        label: 'Send Request',
        shortcut: [{ key: 'Enter', mod: true }],
        run: () => void send(),
      },
      'request.send-focus': {
        label: 'Send and Focus Response',
        shortcut: [{ key: 'Enter', mod: true, shift: true }],
        run: () => void send(true),
      },
      'request.duplicate': {
        label: 'Duplicate Request',
        run: () => duplicateRequest(active()),
      },
      'request.next': {
        label: 'Next Request',
        shortcut: [
          { key: 'Tab', ctrl: true },
          { key: 'PageDown', ctrl: true },
        ],
        run: () => cycleRequest(1),
        disabled: requestCount <= 1,
        repeatable: true,
      },
      'request.previous': {
        label: 'Previous Request',
        shortcut: [
          { key: 'Tab', ctrl: true, shift: true },
          { key: 'PageUp', ctrl: true },
        ],
        run: () => cycleRequest(-1),
        disabled: requestCount <= 1,
        repeatable: true,
      },
      'view.response-right': {
        label: 'Response Right',
        run: () => setResponsePosition('right'),
        checked: responsePosition === 'right',
      },
      'view.response-bottom': {
        label: 'Response Bottom',
        run: () => setResponsePosition('bottom'),
        checked: responsePosition === 'bottom',
      },
      'view.toggle-sidebar': {
        label: 'Sidebar',
        shortcut: [{ key: 'b', mod: true }],
        run: toggleSidebar,
        checked: sidebarVisible,
      },
      'view.toggle-status-bar': {
        label: 'Status Bar',
        run: toggleStatusBar,
        checked: statusBarVisible,
      },
      'view.toggle-theme': { label: 'Toggle Dark Theme', run: () => toggleColorScheme() },
      'tools.settings': {
        label: 'Settings…',
        shortcut: [{ key: ',', mod: true }],
        run: () => setDialog('settings'),
      },
      'help.documentation': { label: 'Documentation', run: openDocumentation },
      'help.shortcuts': { label: 'Keyboard Shortcuts', run: () => setDialog('shortcuts') },
      'help.about': { label: 'About HttpReq', run: () => setDialog('about') },
    };
    for (let position = 1; position <= 9; position += 1) {
      map[`request.goto-${position}`] = {
        label: `Go to Request ${position}`,
        shortcut: [{ key: String(position), code: `Digit${position}`, mod: true }],
        run: () => {
          const target = useWorkbenchStore.getState().workspace.requests[position - 1];
          if (target) setActiveRequest(target.id);
        },
      };
    }

    if (desktop) {
      const action = desktop.performAction;
      // macOS provides edit, zoom and full-screen through its native menu roles instead.
      if (!mac) {
        const edit = (label: string, key: string, run: () => void, shift = false) => ({
          label,
          // Shown in the menu only: the OS/editor already handles these keys natively.
          shortcut: [{ key, mod: true, shift }],
          allowInEditable: false,
          passive: true,
          run,
        });
        Object.assign(map, {
          'edit.undo': edit('Undo', 'z', () => action('undo')),
          'edit.redo': edit('Redo', 'y', () => action('redo')),
          'edit.cut': edit('Cut', 'x', () => action('cut')),
          'edit.copy': edit('Copy', 'c', () => action('copy')),
          'edit.paste': edit('Paste', 'v', () => action('paste')),
          'edit.select-all': edit('Select All', 'a', () => action('select-all')),
          'view.zoom-in': {
            label: 'Zoom In',
            shortcut: [
              { key: '=', mod: true },
              { key: '+', mod: true, shift: true },
              { key: '+', mod: true },
            ],
            run: () => action('zoom-in'),
          },
          'view.zoom-out': {
            label: 'Zoom Out',
            shortcut: [
              { key: '-', mod: true },
              { key: '_', mod: true, shift: true },
            ],
            run: () => action('zoom-out'),
          },
          'view.zoom-reset': {
            label: 'Reset Zoom',
            shortcut: [{ key: '0', code: 'Digit0', mod: true }],
            run: () => action('zoom-reset'),
          },
          'view.fullscreen': {
            label: 'Full Screen',
            shortcut: [{ key: 'F11' }],
            run: () => action('toggle-fullscreen'),
          },
          'app.exit': { label: 'Exit', run: () => action('quit') },
        } satisfies CommandMap);
      }
      map['help.devtools'] = {
        label: 'Toggle Developer Tools',
        run: () => action('toggle-devtools'),
      };
    } else if (typeof document !== 'undefined' && document.fullscreenEnabled) {
      map['view.fullscreen'] = {
        label: 'Full Screen',
        run: () =>
          void (document.fullscreenElement
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen()),
      };
    }
    return map;
  }, [
    addRequest,
    saveNow,
    closeActiveRequest,
    send,
    duplicateRequest,
    cycleRequest,
    setActiveRequest,
    setResponsePosition,
    toggleSidebar,
    toggleStatusBar,
    toggleColorScheme,
    openDocumentation,
    requestCount,
    responsePosition,
    sidebarVisible,
    statusBarVisible,
    desktop,
    mac,
  ]);

  useShortcutManager(commands, mac);

  // The macOS native menu forwards its clicks here, so both menus share one command set.
  useEffect(
    () => desktop?.onMenuCommand((command: MenuCommand) => commands[command]?.run()),
    [desktop, commands],
  );

  const shortcutLabel = (id: string) => {
    const chord = commands[id]?.shortcut?.[0];
    return chord ? formatChord(chord, mac) : undefined;
  };

  if (!request) return null;
  const patch = (value: Partial<HttpRequest>) => updateRequest(request.id, value);
  const sending = execution.isSending(request.id);

  return (
    <AppShell
      header={{ height: TITLE_BAR_HEIGHT }}
      navbar={{
        width: 232,
        breakpoint: 'sm',
        collapsed: { mobile: !opened, desktop: !sidebarVisible },
      }}
      footer={statusBarVisible ? { height: STATUS_BAR_HEIGHT } : undefined}
      padding={0}
      transitionDuration={120}
    >
      {/* Above the navbar (101) so menus drop down over the sidebar; below modals (200). */}
      <AppShell.Header className={classes.header} zIndex={150}>
        <TitleBar
          title={`${request.name} — ${workspace.name}`}
          menus={menus}
          commands={commands}
          mac={mac}
          desktop={desktop}
          sidebarVisible={sidebarVisible}
          mobileNavOpened={opened}
          onToggleMobileNav={toggle}
        />
      </AppShell.Header>

      <AppShell.Navbar p="xs" className={classes.navbar} aria-label="Sidebar">
        <Text className={classes.sectionLabel} component="h2">
          Workspace
        </Text>
        <Stack gap={1}>
          {sidebarItems.map((item) => (
            <NavLink
              key={item.label}
              label={item.label}
              active={item.active}
              leftSection={<item.icon size={16} />}
              rightSection={
                item.soon ? (
                  <Badge size="xs" variant="light" color="gray">
                    Soon
                  </Badge>
                ) : undefined
              }
              disabled={item.soon}
              className={classes.navLink}
            />
          ))}
        </Stack>
        <Divider my="xs" />
        <Text className={classes.sectionLabel} component="h2">
          Requests
        </Text>
        <Stack gap={1} className={classes.requestList}>
          {workspace.requests.map((item) => (
            <NavLink
              key={item.id}
              label={item.name}
              active={item.id === request.id}
              aria-current={item.id === request.id ? 'page' : undefined}
              onClick={() => {
                setActiveRequest(item.id);
                closeNav();
              }}
              className={classes.navLink}
              leftSection={
                <Text span size="xs" fw={700} c={methodColor[item.method]} w={46}>
                  {item.method}
                </Text>
              }
            />
          ))}
        </Stack>
        <Button
          mt="xs"
          variant="subtle"
          color="gray"
          size="xs"
          justify="flex-start"
          leftSection={<IconPlus size={15} />}
          onClick={addRequest}
        >
          New request
        </Button>
      </AppShell.Navbar>

      <AppShell.Main className={classes.main}>
        <RequestTabs
          requests={workspace.requests}
          activeId={request.id}
          unsavedIds={unsavedIds}
          onActivate={setActiveRequest}
          onClose={closeActiveRequest}
          onNew={addRequest}
          onMove={moveRequest}
          newShortcut={shortcutLabel('request.new')}
          closeShortcut={shortcutLabel('request.close')}
          actions={<LayoutToggle />}
        />

        <div
          role="tabpanel"
          id={REQUEST_PANEL_ID}
          aria-labelledby={requestTabId(request.id)}
          className={classes.workspace}
        >
          <SplitPane
            layout={responsePosition}
            ratio={splitRatio}
            defaultRatio={DEFAULT_SPLIT_RATIO[responsePosition]}
            onRatioChange={(ratio) => setSplitRatio(responsePosition, ratio)}
            firstId="request-editor"
            label="Resize request and response panels"
            first={
              <section id="request-editor" aria-label="Request" className={classes.requestArea}>
                <Group gap="xs" p="sm" wrap="nowrap" className={classes.urlBar}>
                  <Select
                    aria-label="HTTP method"
                    w={112}
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
                    className="hr-mono"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  {sending ? (
                    <Button
                      color="red"
                      variant="light"
                      onClick={() => execution.cancel(request.id)}
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void send()}
                      title={`Send (${shortcutLabel('request.send')})`}
                    >
                      Send
                    </Button>
                  )}
                </Group>
                <RequestConfig request={request} onChange={patch} />
              </section>
            }
            second={
              <Box
                component="section"
                ref={responseRef}
                tabIndex={-1}
                aria-label="Response"
                aria-busy={sending}
                className={classes.responseArea}
              >
                <ResponsePanel response={responses[request.id]} loading={sending} />
              </Box>
            }
          />
        </div>
      </AppShell.Main>

      {statusBarVisible && (
        <AppShell.Footer className={classes.footer}>
          <StatusBar
            workspaceName={workspace.name}
            runtimeLabel={desktop ? 'Desktop' : 'Browser'}
            version={version}
            sending={sending}
          />
        </AppShell.Footer>
      )}

      <SettingsDialog opened={dialog === 'settings'} onClose={() => setDialog(null)} />
      <ShortcutsDialog
        opened={dialog === 'shortcuts'}
        onClose={() => setDialog(null)}
        commands={commands}
        mac={mac}
        web={!desktop}
      />
      <AboutDialog
        opened={dialog === 'about'}
        onClose={() => setDialog(null)}
        version={version}
        desktop={desktop}
        onOpenDocumentation={openDocumentation}
      />
    </AppShell>
  );
}
