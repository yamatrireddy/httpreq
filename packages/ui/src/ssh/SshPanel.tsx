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
import { useMemo, useState } from 'react';
import type { SshProfile } from '@httpreq/shared';
import { confirmAction } from '../confirm';
import { useConnectionsStore } from '../connections';
import { tunnelsUsingSshProfile, useWorkbenchStore } from '../store';
import { SshProfileDialog } from './SshProfileDialog';
import { useSsh } from './useSsh';
import classes from './Ssh.module.css';
import { PanelHeader } from '../explorer/PanelHeader';
import {
  BulkDeleteButton,
  RowCheckbox,
  SelectionBar,
  SelectModeButton,
} from '../explorer/Selection';
import { useSelection } from '../explorer/useSelection';

/** The SSH sidebar view: the workspace's connection profiles and their live sessions. */
export function SshPanel({ onOpened }: { onOpened?: () => void }) {
  const profiles = useWorkbenchStore((state) => state.workspace.sshProfiles);
  const createProfile = useWorkbenchStore((state) => state.createSshProfile);
  const duplicateProfile = useWorkbenchStore((state) => state.duplicateSshProfile);
  const deleteProfile = useWorkbenchStore((state) => state.deleteSshProfile);
  const sessions = useConnectionsStore((state) => state.sessions);
  const ssh = useSsh();
  const [editing, setEditing] = useState<string | null>(null);
  const selection = useSelection(useMemo(() => profiles.map((profile) => profile.id), [profiles]));

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

  const removeSelected = async () => {
    const selected = profiles.filter((profile) => selection.isSelected(profile.id));
    if (selected.length === 0) return;
    const workspace = useWorkbenchStore.getState().workspace;
    const dependents = selected.flatMap((profile) => tunnelsUsingSshProfile(workspace, profile.id));
    const count = selected.length;
    const result = await confirmAction({
      title: count === 1 ? 'Delete SSH profile' : `Delete ${count} SSH profiles`,
      message:
        `Delete ${count === 1 ? `“${selected[0]!.name}”` : `${count} SSH profiles`}? ` +
        `${count === 1 ? 'Its stored credential is' : 'Their stored credentials are'} deleted too.` +
        (dependents.length
          ? ` ${dependents.length} tunnel${dependents.length === 1 ? ' uses' : 's use'} ${count === 1 ? 'it' : 'them'} and will stop working until pointed at another connection.`
          : ' This cannot be undone.'),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (result !== 'confirm') return;
    for (const profile of selected) {
      // The vault entry goes first: a profile removed without it would orphan the secret.
      await ssh.deleteCredential(profile.credentialId);
      deleteProfile(profile.id);
    }
    selection.stop();
  };

  return (
    <div className={classes.panel}>
      <PanelHeader title="Connections">
        <SelectModeButton selection={selection} noun="connections" />
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
      <SelectionBar selection={selection} label="Connection selection">
        <BulkDeleteButton
          selection={selection}
          noun="connections"
          onDelete={() => void removeSelected()}
        />
      </SelectionBar>

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
            const checked = selection.isSelected(profile.id);
            return (
              <div
                key={profile.id}
                className={classes.item}
                data-checked={checked || undefined}
                data-selectable={selection.selecting || undefined}
              >
                {selection.selecting && (
                  <RowCheckbox
                    checked={checked}
                    label={profile.name}
                    onChange={() => selection.toggle(profile.id)}
                  />
                )}
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
                  onDoubleClick={() => !selection.selecting && connect(profile)}
                  onClick={() =>
                    selection.selecting ? selection.toggle(profile.id) : setEditing(profile.id)
                  }
                  tabIndex={selection.selecting ? -1 : undefined}
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
                <span className={classes.itemActions} hidden={selection.selecting}>
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
