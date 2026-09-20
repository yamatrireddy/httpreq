import { Button, Menu, Modal, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconPencil,
  IconPlus,
  IconStack2,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import { describeActiveResources, totalActiveResources } from '@httpreq/workspace';
import { confirmAction } from './confirm';
import { useShallow } from 'zustand/react/shallow';
import { activeConnectionCounts, useConnectionsStore } from './connections';
import { useWorkbenchStore } from './store';
import type { WorkspaceActions } from './usePersistence';
import classes from './WorkspaceSwitcher.module.css';

interface Props {
  actions: WorkspaceActions;
  /** Closes every live connection the current workspace owns, before it is swapped out. */
  releaseConnections: () => Promise<void>;
}

/**
 * The workspace switcher.
 *
 * Switching replaces everything the user is looking at, and it tears down the live connections
 * the outgoing workspace owns, so anything running is named in a confirmation first rather than
 * disappearing silently.
 */
export function WorkspaceSwitcher({ actions, releaseConnections }: Props) {
  const current = useWorkbenchStore((state) => state.workspace);
  const workspaces = useWorkbenchStore((state) => state.workspaces);
  const switching = useWorkbenchStore((state) => state.switching);
  // Shallow-compared: the selector derives a fresh object, so it needs a stable comparison.
  const counts = useConnectionsStore(useShallow(activeConnectionCounts));
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  /** True when it is safe to proceed: nothing is running, or the user said to close it. */
  const confirmTeardown = async (verb: string): Promise<boolean> => {
    if (totalActiveResources(counts) === 0) return true;
    const result = await confirmAction({
      title: 'Close active connections?',
      message: `${describeActiveResources(counts)} belong to “${current.name}”. ${verb} closes ${
        totalActiveResources(counts) === 1 ? 'it' : 'them'
      }.`,
      confirmLabel: `${verb} anyway`,
      danger: true,
    });
    return result === 'confirm';
  };

  const switchTo = async (id: string) => {
    if (id === current.id) return;
    if (!(await confirmTeardown('Switching workspace'))) return;
    await releaseConnections();
    if (!(await actions.switchTo(id))) {
      notifications.show({
        color: 'red',
        title: 'Workspace unavailable',
        message: 'That workspace could not be opened. It may have been deleted.',
      });
    }
  };

  const create = async () => {
    if (!(await confirmTeardown('Creating a workspace'))) return;
    await releaseConnections();
    await actions.create();
  };

  const duplicate = async () => {
    const id = await actions.duplicate(current.id);
    if (!id) return;
    notifications.show({
      title: 'Workspace duplicated',
      message:
        current.sshProfiles.length > 0
          ? 'Stored SSH passwords and passphrases are not copied; re-enter them in the copy.'
          : 'The copy is ready in the workspace list.',
    });
  };

  const remove = async (id: string, name: string) => {
    const isCurrent = id === current.id;
    if (isCurrent && !(await confirmTeardown('Deleting this workspace'))) return;
    const result = await confirmAction({
      title: 'Delete workspace',
      message: `Delete “${name}” and everything in it — collections, requests, environments and connection profiles? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (result !== 'confirm') return;
    if (isCurrent) await releaseConnections();
    await actions.remove(id);
  };

  const commitRename = async () => {
    if (!renaming) return;
    const { id, name } = renaming;
    setRenaming(null);
    if (name.trim()) await actions.rename(id, name);
  };

  return (
    <>
      <Menu position="bottom-start" shadow="md" width={280} withinPortal>
        <Menu.Target>
          <UnstyledButton
            className={classes.trigger}
            aria-label={`Workspace: ${current.name}. Select to switch workspace.`}
            disabled={switching}
          >
            <IconStack2 size={14} aria-hidden />
            <span className={classes.name}>{current.name}</span>
            <IconChevronDown size={13} aria-hidden />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Switch workspace</Menu.Label>
          {workspaces.map((workspace) => (
            <Menu.Item
              key={workspace.id}
              onClick={() => void switchTo(workspace.id)}
              leftSection={
                workspace.id === current.id ? (
                  <IconCheck size={14} />
                ) : (
                  <span style={{ width: 14 }} aria-hidden />
                )
              }
              aria-current={workspace.id === current.id ? 'true' : undefined}
            >
              <span className={classes.itemName}>{workspace.name}</span>
            </Menu.Item>
          ))}
          <Menu.Divider />
          {/*
           * Rename, duplicate and delete act on the current workspace rather than on each row:
           * a row is one control that switches, so putting more buttons inside it would nest
           * interactive elements. Managing another workspace means switching to it first.
           */}
          <Menu.Label>“{current.name}”</Menu.Label>
          <Menu.Item
            leftSection={<IconPencil size={14} />}
            onClick={() => setRenaming({ id: current.id, name: current.name })}
          >
            Rename…
          </Menu.Item>
          <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => void duplicate()}>
            Duplicate
          </Menu.Item>
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            disabled={workspaces.length <= 1}
            onClick={() => void remove(current.id, current.name)}
          >
            Delete
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item leftSection={<IconPlus size={14} />} onClick={() => void create()}>
            New workspace
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <Modal
        opened={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename workspace"
        centered
        size="sm"
      >
        <Stack gap="sm">
          <TextInput
            label="Name"
            data-autofocus
            value={renaming?.name ?? ''}
            onChange={(event) =>
              setRenaming((state) =>
                state ? { ...state, name: event.currentTarget.value } : state,
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') void commitRename();
            }}
          />
          <Text size="xs" c="dimmed">
            Requests, environments and connection profiles keep their identifiers, so nothing breaks
            when a workspace is renamed.
          </Text>
          <Button onClick={() => void commitRename()}>Rename</Button>
        </Stack>
      </Modal>
    </>
  );
}
