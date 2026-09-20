import { AppShell, Box, Button, Center, Group, Stack, Text, ThemeIcon, useMantineColorScheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { IconBox, IconPlus, IconSend } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildRequest,
  createVariableResolver,
  executeRequest,
  getAuthProvider,
  requestOAuthTokens,
  toCurl,
  type PipelineContext,
} from '@httpreq/api-client';
import {
  createId,
  DOCUMENTATION_URL,
  type DesktopBridge,
  type HistoryEntry,
  type HistoryRepository,
  type HttpRequest,
  type HttpRuntime,
  type MenuCommand,
  type OAuth2Auth,
  type WorkspaceRepository,
} from '@httpreq/shared';
import './app.css';
import { readAttachment } from './attachments';
import { AuthServicesContext, type AuthServices } from './auth/authServices';
import type { CommandMap } from './commands';
import { useShortcutManager } from './commands';
import { closeTabs as closeRequestTabs } from './closeTabs';
import { ConfirmDialog } from './ConfirmDialog';
import {
  browserConnectivityProbe,
  reportRequestConnectivity,
  useConnectivityMonitor,
} from './connectivity';
import { AboutDialog, SettingsDialog, ShortcutsDialog } from './Dialogs';
import { RequestEditor } from './editor/RequestEditor';
import { EnvironmentSelect } from './EnvironmentSelect';
import { Sidebar } from './explorer/Sidebar';
import { LayoutToggle } from './LayoutToggle';
import type { MenuDefinition } from './MenuBar';
import { REQUEST_PANEL_ID, requestTabId } from './methods';
import { DEFAULT_SPLIT_RATIO, usePreferences } from './preferences';
import { RequestTabs } from './RequestTabs';
import { ResponsePanel } from './ResponsePanel';
import { formatChord } from './shortcuts';
import { SplitPane } from './SplitPane';
import { StatusBar } from './StatusBar';
import { activeEnvironment, editableRequest, useWorkbenchStore } from './store';
import { TitleBar } from './TitleBar';
import { usePersistence } from './usePersistence';
import { useRequestExecution } from './useRequestExecution';
import { VariableContext, type VariableScope } from './variableContext';
import classes from './HttpReqApp.module.css';

/** Must match the Electron window-controls overlay height (`TITLE_BAR_HEIGHT` in desktop). */
const TITLE_BAR_HEIGHT = 36;
const STATUS_BAR_HEIGHT = 24;
const NETWORK_ERRORS = new Set(['NETWORK_ERROR', 'DNS_ERROR', 'CONNECTION_TIMEOUT']);

type Dialog = 'settings' | 'shortcuts' | 'about';

interface Props {
  runtime: HttpRuntime;
  repository: WorkspaceRepository;
  history: HistoryRepository;
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
      { command: 'collection.new' },
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
      { command: 'request.focus-url' },
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

const pipelineContext = (): PipelineContext => {
  const { workspace } = useWorkbenchStore.getState();
  return { workspace, environment: activeEnvironment(workspace), readFile: readAttachment };
};

export function HttpReqApp({ runtime, repository, history, desktop, version }: Props) {
  const [opened, { toggle, close: closeNav }] = useDisclosure();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const { toggleColorScheme } = useMantineColorScheme();
  const { loaded, saveRequest, recordHistory, clearHistory } = usePersistence(repository, history);

  const workspaceName = useWorkbenchStore((state) => state.workspace.name);
  const requests = useWorkbenchStore((state) => state.workspace.requests);
  const openIds = useWorkbenchStore((state) => state.workspace.openRequestIds);
  const environments = useWorkbenchStore((state) => state.workspace.environments);
  const activeEnvironmentId = useWorkbenchStore((state) => state.workspace.activeEnvironmentId);
  const drafts = useWorkbenchStore((state) => state.drafts);
  const activeId = useWorkbenchStore((state) => state.activeRequestId);
  const responses = useWorkbenchStore((state) => state.responses);
  const setActiveRequest = useWorkbenchStore((state) => state.setActiveRequest);
  const cycleRequest = useWorkbenchStore((state) => state.cycleRequest);
  const moveTab = useWorkbenchStore((state) => state.moveTab);
  const createRequest = useWorkbenchStore((state) => state.createRequest);
  const createCollection = useWorkbenchStore((state) => state.createCollection);
  const duplicateNode = useWorkbenchStore((state) => state.duplicateNode);
  const setResponse = useWorkbenchStore((state) => state.setResponse);

  const responsePosition = usePreferences((state) => state.responsePosition);
  const splitRatio = usePreferences((state) => state.splitRatio[state.responsePosition]);
  const setSplitRatio = usePreferences((state) => state.setSplitRatio);
  const sidebarVisible = usePreferences((state) => state.sidebarVisible);
  const sidebarWidth = usePreferences((state) => state.sidebarWidth);
  const statusBarVisible = usePreferences((state) => state.statusBarVisible);
  const setResponsePosition = usePreferences((state) => state.setResponsePosition);
  const toggleSidebar = usePreferences((state) => state.toggleSidebar);
  const toggleStatusBar = usePreferences((state) => state.toggleStatusBar);

  const execution = useRequestExecution();
  const { send: runExecution, cancel: cancelRequest } = execution;
  const responseRef = useRef<HTMLElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
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

  /* Tabs show the saved name and the edited method, keyed and ordered by id. */
  const tabs = useMemo(() => {
    const byId = new Map(requests.map((request) => [request.id, request]));
    return openIds.flatMap((id) => {
      const saved = byId.get(id);
      if (!saved) return [];
      const draft = drafts[id];
      return [{ id, name: saved.name, method: draft?.method ?? saved.method, url: draft?.url ?? saved.url }];
    });
  }, [requests, openIds, drafts]);
  const unsavedIds = useMemo(() => new Set(Object.keys(drafts)), [drafts]);
  const activeName = tabs.find((tab) => tab.id === activeId)?.name;

  /* Variables of the active environment, for highlighting, tooltips and completion. */
  const variableScope = useMemo<VariableScope>(() => {
    const environment = environments.find((item) => item.id === activeEnvironmentId) ?? null;
    return { resolver: createVariableResolver(environment), environmentName: environment?.name ?? null };
  }, [environments, activeEnvironmentId]);

  const authServices = useMemo<AuthServices>(
    () => ({
      requestTokens: (config: OAuth2Auth, options) => {
        const resolver = createVariableResolver(activeEnvironment(useWorkbenchStore.getState().workspace));
        const resolved = getAuthProvider(config).resolve(config, { resolve: resolver.resolve, now: Date.now });
        return requestOAuthTokens(resolved, (prepared) => runtime.execute(prepared), options);
      },
      setVariable: (key, value) => useWorkbenchStore.getState().setEnvironmentVariable(key, value, true),
      openUrl: (url) => {
        if (desktop) desktop.openAuthorizationUrl(url);
        else window.open(url, '_blank', 'noopener,noreferrer');
      },
      resolve: (text) => variableScope.resolver.resolve(text),
    }),
    [runtime, desktop, variableScope],
  );

  const buildCurl = useCallback(async (request: HttpRequest) => {
    const built = await buildRequest(request, {
      ...pipelineContext(),
      // cURL references files by name, so their bytes are not needed.
      readFile: async () => new Uint8Array(),
      resolverOptions: { keepSecrets: true },
    });
    return toCurl(built.prepared, request.body.binary?.name);
  }, []);

  const send = useCallback(
    async (focusResponse = false) => {
      const state = useWorkbenchStore.getState();
      const request = editableRequest(state, state.activeRequestId);
      if (!request) return;
      if (focusResponse) responseRef.current?.focus();
      const context = pipelineContext();
      const outcome = await runExecution(request.id, (signal) =>
        executeRequest(request, context, runtime, signal),
      );
      const entry: HistoryEntry = {
        id: createId(),
        requestId: request.id,
        name: request.name,
        method: request.method,
        // The unresolved template, so resolved secrets never reach history.
        url: request.url,
        status: null,
        statusText: '',
        durationMs: null,
        sizeBytes: null,
        timestamp: new Date().toISOString(),
      };
      if (outcome.kind === 'success') {
        const { response, built } = outcome.value;
        setResponse(request.id, response);
        reportRequestConnectivity('success');
        recordHistory({
          ...entry,
          status: response.status,
          statusText: response.statusText,
          durationMs: response.durationMs,
          sizeBytes: response.sizeBytes,
        });
        const notes = [...built.warnings];
        if (response.truncated) {
          notes.push(`The response was cut at ${request.settings.responseSizeLimitMb} MB (Settings › Response size limit).`);
        }
        if (notes.length) notifications.show({ color: 'yellow', title: 'Sent with warnings', message: notes.join(' ') });
      } else if (outcome.kind === 'cancelled') {
        notifications.show({ color: 'yellow', message: 'Request cancelled.' });
      } else {
        if (outcome.code && NETWORK_ERRORS.has(outcome.code)) reportRequestConnectivity('network-error');
        recordHistory({ ...entry, error: outcome.message });
        notifications.show({ color: 'red', title: 'Request failed', message: outcome.message });
      }
    },
    [runExecution, runtime, setResponse, recordHistory],
  );

  const saveActive = useCallback(async () => {
    const id = useWorkbenchStore.getState().activeRequestId;
    if (!id) return true;
    const ok = await saveRequest(id);
    if (!ok) {
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: 'The request could not be written to local storage. Your changes are kept; try again.',
      });
    }
    return ok;
  }, [saveRequest]);

  const closeTabs = useCallback(
    (ids: Iterable<string>) => closeRequestTabs(ids, { saveRequest, cancelRequest }),
    [cancelRequest, saveRequest],
  );

  const closeTab = useCallback((id: string) => closeTabs([id]), [closeTabs]);

  const newRequest = useCallback(() => {
    createRequest(null);
    requestAnimationFrame(() => urlRef.current?.focus());
  }, [createRequest]);

  const openDocumentation = useCallback(() => {
    if (desktop) desktop.openExternal(DOCUMENTATION_URL);
    else window.open(DOCUMENTATION_URL, '_blank', 'noopener,noreferrer');
  }, [desktop]);

  const tabCount = tabs.length;
  const commands = useMemo<CommandMap>(() => {
    const active = () => useWorkbenchStore.getState().activeRequestId;
    const map: CommandMap = {
      'request.new': { label: 'New Request', shortcut: [{ key: 't', mod: true }], run: newRequest },
      'collection.new': { label: 'New Collection', run: () => void createCollection() },
      'request.save': {
        label: 'Save',
        shortcut: [{ key: 's', mod: true }],
        run: () => void saveActive(),
        disabled: tabCount === 0,
      },
      'request.close': {
        label: 'Close Request',
        shortcut: [{ key: 'w', mod: true }],
        run: () => {
          const id = active();
          if (id) void closeTab(id);
        },
        disabled: tabCount === 0,
      },
      'request.send': {
        label: 'Send Request',
        shortcut: [{ key: 'Enter', mod: true }],
        run: () => void send(),
        disabled: tabCount === 0,
      },
      'request.send-focus': {
        label: 'Send and Focus Response',
        shortcut: [{ key: 'Enter', mod: true, shift: true }],
        run: () => void send(true),
        disabled: tabCount === 0,
      },
      'request.focus-url': {
        label: 'Focus URL',
        shortcut: [{ key: 'l', mod: true }],
        run: () => {
          urlRef.current?.focus();
          urlRef.current?.select();
        },
        disabled: tabCount === 0,
      },
      'request.duplicate': {
        label: 'Duplicate Request',
        run: () => {
          const id = active();
          if (id) duplicateNode(id);
        },
        disabled: tabCount === 0,
      },
      'request.next': {
        label: 'Next Request',
        shortcut: [
          { key: 'Tab', ctrl: true },
          { key: 'PageDown', ctrl: true },
        ],
        run: () => cycleRequest(1),
        disabled: tabCount <= 1,
        repeatable: true,
      },
      'request.previous': {
        label: 'Previous Request',
        shortcut: [
          { key: 'Tab', ctrl: true, shift: true },
          { key: 'PageUp', ctrl: true },
        ],
        run: () => cycleRequest(-1),
        disabled: tabCount <= 1,
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
          const target = useWorkbenchStore.getState().workspace.openRequestIds[position - 1];
          if (target) setActiveRequest(target);
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
    newRequest,
    createCollection,
    saveActive,
    closeTab,
    send,
    duplicateNode,
    cycleRequest,
    setActiveRequest,
    setResponsePosition,
    toggleSidebar,
    toggleStatusBar,
    toggleColorScheme,
    openDocumentation,
    tabCount,
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

  if (!loaded) return null;
  const sending = activeId ? execution.isSending(activeId) : false;

  return (
    <VariableContext.Provider value={variableScope}>
      <AuthServicesContext.Provider value={authServices}>
        <AppShell
          header={{ height: TITLE_BAR_HEIGHT }}
          navbar={{
            width: sidebarWidth,
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
              title={activeName ? `${activeName} — ${workspaceName}` : workspaceName}
              menus={menus}
              commands={commands}
              mac={mac}
              desktop={desktop}
              sidebarVisible={sidebarVisible}
              mobileNavOpened={opened}
              onToggleMobileNav={toggle}
            />
          </AppShell.Header>

          <AppShell.Navbar className={classes.navbar} aria-label="Sidebar">
            <Sidebar onClearHistory={clearHistory} onNavigate={closeNav} />
          </AppShell.Navbar>

          <AppShell.Main className={classes.main}>
            <RequestTabs
              requests={tabs}
              activeId={activeId ?? ''}
              unsavedIds={unsavedIds}
              onActivate={setActiveRequest}
              onClose={(id) => void closeTab(id)}
              onCloseMany={(ids) => void closeTabs(ids)}
              onNew={newRequest}
              onMove={moveTab}
              newShortcut={shortcutLabel('request.new')}
              closeShortcut={shortcutLabel('request.close')}
              actions={
                <>
                  <EnvironmentSelect />
                  <LayoutToggle />
                </>
              }
            />

            {activeId && tabs.some((tab) => tab.id === activeId) ? (
              <div
                role="tabpanel"
                id={REQUEST_PANEL_ID}
                aria-labelledby={requestTabId(activeId)}
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
                      <RequestEditor
                        key={activeId}
                        requestId={activeId}
                        desktop={!!desktop}
                        sending={sending}
                        onSend={() => void send()}
                        onCancel={() => execution.cancel(activeId)}
                        onSave={() => void saveActive()}
                        urlRef={urlRef}
                        buildCurl={buildCurl}
                        shortcuts={{
                          send: shortcutLabel('request.send'),
                          save: shortcutLabel('request.save'),
                          focusUrl: shortcutLabel('request.focus-url'),
                        }}
                      />
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
                      <ResponsePanel response={responses[activeId]} loading={sending} />
                    </Box>
                  }
                />
              </div>
            ) : (
              <Center className={classes.workspace}>
                <Stack align="center" gap="xs">
                  <ThemeIcon variant="light" size={44} radius="xl">
                    <IconSend size={22} />
                  </ThemeIcon>
                  <Text fw={600}>No request open</Text>
                  <Text size="sm" c="dimmed">
                    Open a request from the explorer, or start a new one.
                  </Text>
                  <Group gap="xs" mt="xs">
                    <Button leftSection={<IconPlus size={15} />} onClick={newRequest}>
                      New request
                    </Button>
                    <Button variant="default" leftSection={<IconBox size={15} />} onClick={() => createCollection()}>
                      New collection
                    </Button>
                  </Group>
                </Stack>
              </Center>
            )}
          </AppShell.Main>

          {statusBarVisible && (
            <AppShell.Footer className={classes.footer}>
              <StatusBar
                workspaceName={workspaceName}
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
          <ConfirmDialog />
        </AppShell>
      </AuthServicesContext.Provider>
    </VariableContext.Provider>
  );
}
