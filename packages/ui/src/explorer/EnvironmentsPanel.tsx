import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  Radio,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconCopy,
  IconDots,
  IconPencil,
  IconPlus,
  IconTrash,
  IconVariable,
} from '@tabler/icons-react';
import { useState } from 'react';
import { createId, type EnvironmentVariable } from '@httpreq/shared';
import { confirmAction } from '../confirm';
import { KeyValueTable } from '../editor/KeyValueTable';
import { useWorkbenchStore } from '../store';
import classes from './Sidebar.module.css';

export function EnvironmentsPanel() {
  const environments = useWorkbenchStore((state) => state.workspace.environments);
  const activeId = useWorkbenchStore((state) => state.workspace.activeEnvironmentId);
  const actions = useWorkbenchStore.getState;
  const [editingId, setEditingId] = useState<string | null>(null);

  const remove = async (id: string, name: string) => {
    const result = await confirmAction({
      title: 'Delete environment',
      message: `Delete “${name}” and its variables? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (result === 'confirm') actions().deleteEnvironment(id);
  };

  return (
    <div className={classes.explorer}>
      <div className={classes.panelHeader}>
        <Text component="h2" className={classes.panelTitle}>
          Environments
        </Text>
        <Tooltip label="New environment">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="New environment"
            onClick={() => setEditingId(actions().createEnvironment())}
          >
            <IconPlus size={15} />
          </ActionIcon>
        </Tooltip>
      </div>
      <Text size="xs" c="dimmed" px={12} pb={6}>
        The active environment resolves <code>{'{{variables}}'}</code> when a request is sent.
      </Text>
      <Radio.Group
        value={activeId ?? ''}
        onChange={(value) => actions().setActiveEnvironment(value || null)}
        aria-label="Active environment"
      >
        <Stack gap={1} className={classes.tree}>
          <div className={classes.envRow}>
            <Radio value="" label="No environment" size="xs" />
          </div>
          {environments.map((environment) => (
            <div
              key={environment.id}
              className={classes.envRow}
              data-selected={environment.id === activeId || undefined}
            >
              <Radio value={environment.id} aria-label={`Use ${environment.name}`} size="xs" />
              <UnstyledButton
                className={classes.envName}
                onClick={() => setEditingId(environment.id)}
              >
                <IconVariable size={14} aria-hidden />
                <span className={classes.rowName}>{environment.name}</span>
                <Text span size="xs" c="dimmed">
                  {
                    environment.variables.filter((variable) => variable.enabled && variable.key)
                      .length
                  }
                </Text>
              </UnstyledButton>
              <Menu position="bottom-end" withinPortal shadow="md">
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="xs"
                    aria-label={`Actions for ${environment.name}`}
                  >
                    <IconDots size={13} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconPencil size={14} />}
                    onClick={() => setEditingId(environment.id)}
                  >
                    Edit variables
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconCopy size={14} />}
                    onClick={() => actions().duplicateEnvironment(environment.id)}
                  >
                    Duplicate
                  </Menu.Item>
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => void remove(environment.id, environment.name)}
                  >
                    Delete
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </div>
          ))}
        </Stack>
      </Radio.Group>
      {environments.length === 0 && (
        <Stack align="flex-start" px={12} py="sm" gap="xs">
          <Text size="xs" c="dimmed">
            Create an environment such as “Development” with a <code>base_url</code> variable.
          </Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={() => setEditingId(actions().createEnvironment())}
          >
            New environment
          </Button>
        </Stack>
      )}
      <EnvironmentDialog environmentId={editingId} onClose={() => setEditingId(null)} />
    </div>
  );
}

function EnvironmentDialog({
  environmentId,
  onClose,
}: {
  environmentId: string | null;
  onClose: () => void;
}) {
  const environment = useWorkbenchStore((state) =>
    state.workspace.environments.find((item) => item.id === environmentId),
  );
  const activeId = useWorkbenchStore((state) => state.workspace.activeEnvironmentId);
  const update = useWorkbenchStore((state) => state.updateEnvironment);
  const setActive = useWorkbenchStore((state) => state.setActiveEnvironment);

  return (
    <Modal opened={!!environment} onClose={onClose} title="Environment" size="xl">
      {environment && (
        <Stack gap="sm">
          <Group align="flex-end" gap="sm">
            <TextInput
              label="Name"
              value={environment.name}
              onChange={(event) => update(environment.id, { name: event.currentTarget.value })}
              onBlur={(event) =>
                !event.currentTarget.value.trim() && update(environment.id, { name: 'Environment' })
              }
              style={{ flex: 1 }}
            />
            <Button
              variant={environment.id === activeId ? 'light' : 'default'}
              onClick={() => setActive(environment.id)}
              disabled={environment.id === activeId}
            >
              {environment.id === activeId ? 'Active' : 'Set active'}
            </Button>
          </Group>
          <KeyValueTable<EnvironmentVariable>
            label="Variables"
            keyPlaceholder="Variable"
            items={environment.variables}
            onChange={(variables) => update(environment.id, { variables })}
            createRow={(patch) => ({
              id: createId(),
              key: '',
              value: '',
              enabled: true,
              secret: false,
              ...patch,
            })}
            allowSecret
            showDescription={false}
          />
          <Text size="xs" c="dimmed">
            Use a variable as <code>{'{{name}}'}</code> in URLs, parameters, headers, bodies and
            authorization. Secret values are masked and kept only for this session; they are never
            written to disk.
          </Text>
          <Group justify="flex-end">
            <Button onClick={onClose}>Done</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
