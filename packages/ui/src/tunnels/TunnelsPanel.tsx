import { ActionIcon, Button, Menu, Text, Tooltip } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCopy,
  IconDots,
  IconPencil,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlus,
  IconRefresh,
  IconRouter,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import type { TunnelProfile, TunnelStatus } from '@httpreq/shared';
import { confirmAction } from '../confirm';
import { useConnectionsStore } from '../connections';
import { formatSize } from '../format';
import { useWorkbenchStore } from '../store';
import { TunnelDialog } from './TunnelDialog';
import { useTunnels } from './useTunnels';
import classes from '../ssh/Ssh.module.css';
import { PanelHeader } from '../explorer/PanelHeader';

const STATUS_LABEL: Record<TunnelStatus, string> = {
  stopped: 'Stopped',
  starting: 'Starting…',
  active: 'Active',
  stopping: 'Stopping…',
  error: 'Error',
};

/** "2 h 14 m", "3 m", "12 s" — enough to see how long a tunnel has been up. */
const uptime = (startedAt: string | null): string => {
  if (!startedAt) return '';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} m`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
};

/** The Tunnels sidebar view: the workspace's forwarding profiles and their live state. */
export function TunnelsPanel() {
  const profiles = useWorkbenchStore((state) => state.workspace.tunnelProfiles);
  const sshProfiles = useWorkbenchStore((state) => state.workspace.sshProfiles);
  const createTunnel = useWorkbenchStore((state) => state.createTunnelProfile);
  const duplicateTunnel = useWorkbenchStore((state) => state.duplicateTunnelProfile);
  const deleteTunnel = useWorkbenchStore((state) => state.deleteTunnelProfile);
  const states = useConnectionsStore((state) => state.tunnels);
  const api = useTunnels();
  const [editing, setEditing] = useState<string | null>(null);

  const report = (error: Awaited<ReturnType<typeof api.start>>) => {
    if (error) {
      notifications.show({ color: 'red', title: 'Tunnel not started', message: error.message });
    }
  };

  const remove = async (tunnel: TunnelProfile) => {
    const result = await confirmAction({
      title: 'Delete tunnel',
      message: `Delete “${tunnel.name}”? If it is running it will be stopped first.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (result !== 'confirm') return;
    await api.stop(tunnel.id);
    deleteTunnel(tunnel.id);
  };

  return (
    <div className={classes.panel}>
      <PanelHeader title="Tunnels">
        <Tooltip label="New tunnel">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="New tunnel"
            onClick={() => setEditing(createTunnel())}
          >
            <IconPlus size={15} />
          </ActionIcon>
        </Tooltip>
      </PanelHeader>

      <div className={classes.list}>
        {profiles.length === 0 ? (
          <div className={classes.empty}>
            <Text size="sm" c="dimmed" mb="xs">
              {sshProfiles.length
                ? 'No tunnels in this workspace.'
                : 'Create an SSH connection first, then a tunnel to forward through it.'}
            </Text>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => setEditing(createTunnel())}
            >
              New tunnel
            </Button>
          </div>
        ) : (
          profiles.map((tunnel) => {
            const state = states[tunnel.id];
            const status = state?.status ?? 'stopped';
            const running = status === 'active' || status === 'starting';
            const transferred = state
              ? `${formatSize(state.bytesSent)} ↑ · ${formatSize(state.bytesReceived)} ↓`
              : '';
            return (
              <div key={tunnel.id} className={classes.item}>
                <IconRouter size={15} aria-hidden />
                <button
                  type="button"
                  className={classes.itemText}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  onClick={() => setEditing(tunnel.id)}
                  title={`${tunnel.localBindAddress}:${tunnel.localPort} → ${tunnel.remoteHost}:${tunnel.remotePort}`}
                >
                  <span className={classes.itemName}>
                    <span className={classes.status} data-status={status}>
                      <span className={classes.dot} aria-hidden />
                    </span>{' '}
                    {tunnel.name}
                  </span>
                  <span className={classes.itemDetail}>
                    {tunnel.localBindAddress}:{tunnel.localPort} → {tunnel.remoteHost}:
                    {tunnel.remotePort}
                  </span>
                  <span className={classes.itemDetail}>
                    {STATUS_LABEL[status]}
                    {state?.startedAt && status === 'active' ? ` · ${uptime(state.startedAt)}` : ''}
                    {state && status === 'active' ? ` · ${transferred}` : ''}
                  </span>
                  {state?.error && (
                    <span
                      className={classes.itemDetail}
                      style={{ color: 'var(--mantine-color-red-text)' }}
                    >
                      <IconAlertTriangle size={10} style={{ verticalAlign: 'middle' }} />{' '}
                      {state.error.message}
                    </span>
                  )}
                </button>
                <span className={classes.itemActions}>
                  {running ? (
                    <Tooltip label="Stop tunnel">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label={`Stop ${tunnel.name}`}
                        onClick={() => void api.stop(tunnel.id)}
                      >
                        <IconPlayerStop size={14} />
                      </ActionIcon>
                    </Tooltip>
                  ) : (
                    <Tooltip label="Start tunnel">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label={`Start ${tunnel.name}`}
                        onClick={() => void api.start(tunnel).then(report)}
                      >
                        <IconPlayerPlay size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Menu position="bottom-end" withinPortal shadow="md" width={190}>
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label={`Actions for ${tunnel.name}`}
                      >
                        <IconDots size={14} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconRefresh size={14} />}
                        onClick={() => void api.restart(tunnel).then(report)}
                      >
                        Restart
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconPencil size={14} />}
                        onClick={() => setEditing(tunnel.id)}
                      >
                        Edit…
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconCopy size={14} />}
                        onClick={() => {
                          const copy = duplicateTunnel(tunnel.id);
                          if (copy) setEditing(copy);
                        }}
                      >
                        Duplicate
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() => void remove(tunnel)}
                      >
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </span>
              </div>
            );
          })
        )}
      </div>

      <TunnelDialog tunnelId={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
