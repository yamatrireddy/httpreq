import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Radio,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconChevronRight,
  IconCopy,
  IconDots,
  IconPencil,
  IconPlus,
  IconTrash,
  IconVariable,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { createId, type EnvironmentVariable } from '@httpreq/shared';
import { confirmAction } from '../confirm';
import { KeyValueTable } from '../editor/KeyValueTable';
import { useWorkbenchStore } from '../store';
import { PanelHeader } from './PanelHeader';
import classes from './Sidebar.module.css';

export function EnvironmentsPanel() {
  const environments = useWorkbenchStore((state) => state.workspace.environments);
  const activeId = useWorkbenchStore((state) => state.workspace.activeEnvironmentId);
  const actions = useWorkbenchStore.getState;
  const [editingId, setEditingId] = useState<string | null>(null);
  // Set for an environment that was just created, whose name is the first thing to fill in.
  const [namingId, setNamingId] = useState<string | null>(null);

  const create = () => {
    const id = actions().createEnvironment();
    setEditingId(id);
    setNamingId(id);
  };
  const toggleEditing = (id: string) => {
    setEditingId((current) => (current === id ? null : id));
    setNamingId(null);
  };

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
      <PanelHeader title="Environments">
        <Tooltip label="New environment">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="New environment"
            onClick={create}
          >
            <IconPlus size={15} />
          </ActionIcon>
        </Tooltip>
      </PanelHeader>
      <Text size="xs" c="dimmed" px={12} py={6}>
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
            <div key={environment.id} className={classes.envItem}>
              <div
                className={classes.envRow}
                data-selected={environment.id === activeId || undefined}
              >
                <Radio value={environment.id} aria-label={`Use ${environment.name}`} size="xs" />
                <UnstyledButton
                  className={classes.envName}
                  aria-expanded={environment.id === editingId}
                  aria-controls={
                    environment.id === editingId ? editorId(environment.id) : undefined
                  }
                  onClick={() => toggleEditing(environment.id)}
                >
                  <IconChevronRight
                    size={12}
                    className={classes.envChevron}
                    data-open={environment.id === editingId || undefined}
                    aria-hidden
                  />
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
                      onClick={() => {
                        setEditingId(environment.id);
                        setNamingId(null);
                      }}
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
              {environment.id === editingId && (
                <EnvironmentEditor
                  environmentId={environment.id}
                  focusName={environment.id === namingId}
                  onClose={() => toggleEditing(environment.id)}
                />
              )}
            </div>
          ))}
        </Stack>
      </Radio.Group>
      {environments.length === 0 && (
        <Stack align="flex-start" px={12} py="sm" gap="xs">
          <Text size="xs" c="dimmed">
            Create an environment such as “Development” with a <code>base_url</code> variable.
          </Text>
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={create}>
            New environment
          </Button>
        </Stack>
      )}
    </div>
  );
}

const editorId = (id: string) => `environment-editor-${id}`;

/**
 * The environment's name and variables, edited in place under its row rather than in a dialog,
 * so the list (and which environment is active) stays in view while variables are filled in.
 */
function EnvironmentEditor({
  environmentId,
  focusName,
  onClose,
}: {
  environmentId: string;
  focusName: boolean;
  onClose: () => void;
}) {
  const environment = useWorkbenchStore((state) =>
    state.workspace.environments.find((item) => item.id === environmentId),
  );
  const activeId = useWorkbenchStore((state) => state.workspace.activeEnvironmentId);
  const update = useWorkbenchStore((state) => state.updateEnvironment);
  const setActive = useWorkbenchStore((state) => state.setActiveEnvironment);
  const rootRef = useRef<HTMLDivElement>(null);

  // Opening an editor lower in a long list must not leave it below the fold.
  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);

  if (!environment) return null;
  const active = environment.id === activeId;

  return (
    <div
      ref={rootRef}
      id={editorId(environment.id)}
      role="group"
      aria-label={`Edit ${environment.name}`}
      className={classes.envEditor}
    >
      <Stack gap={8}>
        <Group align="flex-end" gap={6} wrap="nowrap">
          <TextInput
            size="xs"
            label="Name"
            value={environment.name}
            autoFocus={focusName}
            onFocus={(event) => focusName && event.currentTarget.select()}
            onChange={(event) => update(environment.id, { name: event.currentTarget.value })}
            onBlur={(event) =>
              !event.currentTarget.value.trim() && update(environment.id, { name: 'Environment' })
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <Button
            size="xs"
            variant={active ? 'light' : 'default'}
            onClick={() => setActive(environment.id)}
            disabled={active}
          >
            {active ? 'Active' : 'Set active'}
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
          <Button size="xs" variant="default" onClick={onClose}>
            Done
          </Button>
        </Group>
      </Stack>
    </div>
  );
}
