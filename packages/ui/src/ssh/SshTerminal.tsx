import { Alert, Button, Group, Text } from '@mantine/core';
import { IconAlertTriangle, IconPlugConnectedX, IconRefresh } from '@tabler/icons-react';
import { useComputedColorScheme } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { SshStatus } from '@httpreq/shared';
import { useConnectionsStore } from '../connections';
import { useSsh } from './useSsh';
import classes from './Ssh.module.css';

const STATUS_LABEL: Record<SshStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnecting: 'Disconnecting…',
  error: 'Error',
};

const THEMES = {
  dark: {
    background: '#141414',
    foreground: '#e6e6e6',
    cursor: '#e6e6e6',
    selectionBackground: '#3a3a3a',
  },
  light: {
    background: '#ffffff',
    foreground: '#1f2328',
    cursor: '#1f2328',
    selectionBackground: '#cfe2ff',
  },
};

interface Props {
  sessionId: string;
}

/**
 * An interactive shell rendered with xterm.js.
 *
 * The terminal owns no connection: it writes what the session emits and forwards what the user
 * types. Scrollback, selection, copy/paste and the standard key handling come from xterm; the only
 * addition is Ctrl/Cmd+Shift+C/V, because a bare Ctrl+C has to reach the remote shell as an
 * interrupt rather than copying.
 */
export function SshTerminal({ sessionId }: Props) {
  const ssh = useSsh();
  const session = useConnectionsStore((state) => state.sessions[sessionId]);
  const colorScheme = useComputedColorScheme('dark');
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const instance = new Terminal({
      fontFamily: 'var(--mantine-font-family-monospace), "JetBrains Mono", monospace',
      fontSize: 13,
      // Deep enough to hold a long build log without holding a session's worth of memory.
      scrollback: 5000,
      cursorBlink: true,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    instance.loadAddon(fit);
    instance.open(element);
    terminal.current = instance;

    const applyFit = () => {
      try {
        fit.fit();
      } catch {
        // The element can be measured as zero while its tab is hidden.
        return;
      }
      ssh.resize(sessionId, {
        cols: instance.cols,
        rows: instance.rows,
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };
    applyFit();

    const offData = ssh.onData(sessionId, (data) => instance.write(data));
    const onInput = instance.onData((data) => ssh.write(sessionId, data));
    const observer = new ResizeObserver(applyFit);
    observer.observe(element);

    // Ctrl+C must stay SIGINT, so copy and paste use the terminal convention with Shift.
    const onKey = instance.attachCustomKeyEventHandler((event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (event.type !== 'keydown' || !modifier || !event.shiftKey) return true;
      if (event.key.toLowerCase() === 'c' && instance.hasSelection()) {
        void navigator.clipboard.writeText(instance.getSelection());
        return false;
      }
      if (event.key.toLowerCase() === 'v') {
        void navigator.clipboard.readText().then((text) => ssh.write(sessionId, text));
        return false;
      }
      return true;
    });
    void onKey;

    return () => {
      observer.disconnect();
      offData();
      onInput.dispose();
      instance.dispose();
      terminal.current = null;
    };
  }, [sessionId, ssh]);

  // Only the palette changes with the theme; the terminal itself is never remounted.
  useEffect(() => {
    if (terminal.current) terminal.current.options.theme = THEMES[colorScheme];
  }, [colorScheme]);

  const status = session?.status ?? 'disconnected';

  return (
    <div className={classes.terminalPanel}>
      <div className={classes.terminalBar}>
        <Group gap="xs">
          <span className={classes.status} data-status={status}>
            <span className={classes.dot} aria-hidden />
            <span aria-live="polite">{STATUS_LABEL[status]}</span>
          </span>
          <Text size="xs" c="dimmed">
            {session?.name}
          </Text>
        </Group>
        <Group gap={6}>
          <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            leftSection={<IconRefresh size={14} />}
            onClick={() => void ssh.reconnect(sessionId)}
          >
            Reconnect
          </Button>
          <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            leftSection={<IconPlugConnectedX size={14} />}
            disabled={status === 'disconnected'}
            onClick={() => void ssh.disconnect(sessionId)}
          >
            Disconnect
          </Button>
        </Group>
      </div>

      {session?.error && (
        <Alert
          color="red"
          variant="light"
          radius={0}
          icon={<IconAlertTriangle size={16} />}
          title={session.error.message}
        >
          {session.error.detail && (
            <Text size="xs" component="pre" className={classes.errorDetail}>
              {session.error.detail}
            </Text>
          )}
        </Alert>
      )}

      <div ref={host} className={classes.terminal} data-theme={colorScheme} />
    </div>
  );
}
