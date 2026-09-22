import { ActionIcon, Button, Menu, Text, Tooltip } from '@mantine/core';
import {
  IconCopy,
  IconDots,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconServer,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import type { SshProfile } from '@httpreq/shared';
import { confirmAction } from '../confirm';
import { useConnectionsStore } from '../connections';
import { tunnelsUsingSshProfile, useWorkbenchStore } from '../store';
import { SshProfileDialog } from './SshProfileDialog';
import { useSsh } from './useSsh';
import classes from './Ssh.module.css';
import { PanelHeader } from '../explorer/PanelHeader';

/** The SSH sidebar view: the workspace's connection profiles and their live sessions. */
export function SshPanel({ onOpened }: { onOpened?: () => void }) {
  const profiles = useWorkbenchStore((state) => state.workspace.sshProfiles);
  const createProfile = useWorkbenchStore((state) => state.createSshProfile);
  const duplicateProfile = useWorkbenchStore((state) => state.duplicateSshProfile);
  const deleteProfile = useWorkbenchStore((state) => state.deleteSshProfile);
  const sessions = useConnectionsStore((state) => state.sessions);
  const ssh = useSsh();
  const [editing, setEditing] = useState<string | null>(null);

  const liveCount = (profileId: string) =>
    Object.values(sessions).filter(
      (session) => session?.profileId === profileId && session.status === 'connected',
    ).length;

  const connect = (profile: SshProfile) => {
    void ssh.open(profile);
    onOpened?.();
  };

  const remove = async (profile: SshProfile) => {
    const workspace = useWorkbenchStore.getState().workspace;
    const dependents = tunnelsUsingSshProfile(workspace, profile.id);
    const result = await confirmAction({
      title: 'Delete SSH profile',
      message: dependents.length
        ? `Delete “${profile.name}”? ${dependents.length === 1 ? 'The tunnel' : 'The tunnels'} ${dependents
            .map((tunnel) => `“${tunnel.name}”`)
            .join(
              ', ',
            )} ${dependents.length === 1 ? 'uses' : 'use'} it and will stop working until ${
            dependents.length === 1 ? 'it is' : 'they are'
          } pointed at another connection. Its stored credential is deleted too.`
        : `Delete “${profile.name}”? Its stored password or passphrase is deleted with it. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (result !== 'confirm') return;
    // The vault entry goes first: a profile removed without it would orphan the secret.
    await ssh.deleteCredential(profile.credentialId);
    deleteProfile(profile.id);
  };

  return (
    <div className={classes.panel}>
      <PanelHeader title="Connections">
        <Tooltip label="New SSH connection">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="New SSH connection"
            onClick={() => setEditing(createProfile())}
          >
            <IconPlus size={15} />
          </ActionIcon>
        </Tooltip>
      </PanelHeader>

      <div className={classes.list}>
        {profiles.length === 0 ? (
          <div className={classes.empty}>
            <Text size="sm" c="dimmed" mb="xs">
              No SSH connections in this workspace.
            </Text>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => setEditing(createProfile())}
            >
              New connection
            </Button>
          </div>
        ) : (
          profiles.map((profile) => {
            const live = liveCount(profile.id);
            return (
              <div key={profile.id} className={classes.item}>
                <IconServer size={15} aria-hidden />
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
                  onDoubleClick={() => connect(profile)}
                  onClick={() => setEditing(profile.id)}
                  title={`${profile.username || 'user'}@${profile.host || 'host'}:${profile.port}`}
                >
                  <span className={classes.itemName}>
                    {profile.name}
                    {live > 0 && ` · ${live} connected`}
                  </span>
                  <span className={classes.itemDetail}>
                    {profile.username || 'user'}@{profile.host || 'host'}:{profile.port}
                  </span>
                </button>
                <span className={classes.itemActions}>
                  <Tooltip label="Connect">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      aria-label={`Connect to ${profile.name}`}
                      onClick={() => connect(profile)}
                    >
                      <IconPlayerPlay size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Menu position="bottom-end" withinPortal shadow="md" width={190}>
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label={`Actions for ${profile.name}`}
                      >
                        <IconDots size={14} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconPencil size={14} />}
                        onClick={() => setEditing(profile.id)}
                      >
                        Edit…
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconCopy size={14} />}
                        onClick={() => {
                          const copy = duplicateProfile(profile.id);
                          if (copy) setEditing(copy);
                        }}
                      >
                        Duplicate
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() => void remove(profile)}
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

      <SshProfileDialog profileId={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
