import { ActionIcon, Button, Checkbox, Group, Stack, TextInput, Tooltip } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { createId, type KeyValueItem } from '@httpreq/shared';

interface Props {
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
}: Props) {
  const update = (id: string, patch: Partial<KeyValueItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  return (
    <Stack gap="xs">
      {items.map((item) => (
        <Group key={item.id} gap="xs" wrap="nowrap">
          <Checkbox
            aria-label={`Enable ${item.key || 'row'}`}
            checked={item.enabled}
            onChange={(event) => update(item.id, { enabled: event.currentTarget.checked })}
          />
          <TextInput
            aria-label="Key"
            placeholder={keyPlaceholder}
            value={item.key}
            onChange={(event) => update(item.id, { key: event.currentTarget.value })}
            className="hr-mono"
            style={{ flex: 1 }}
          />
          <TextInput
            aria-label="Value"
            placeholder={valuePlaceholder}
            value={item.value}
            onChange={(event) => update(item.id, { value: event.currentTarget.value })}
            className="hr-mono"
            style={{ flex: 1 }}
          />
          <Tooltip label="Remove row">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => onChange(items.filter((row) => row.id !== item.id))}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ))}
      <Button
        variant="subtle"
        color="gray"
        leftSection={<IconPlus size={15} />}
        onClick={() => onChange([...items, { id: createId(), key: '', value: '', enabled: true }])}
        style={{ alignSelf: 'flex-start' }}
      >
        Add row
      </Button>
    </Stack>
  );
}
