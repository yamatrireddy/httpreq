import { ActionIcon, Autocomplete, Button, Checkbox, Group, Text, Textarea, Tooltip } from '@mantine/core';
import { IconCopy, IconLock, IconLockOpen, IconTrash } from '@tabler/icons-react';
import { memo, useState, type ReactNode } from 'react';
import { createId, type KeyValueItem } from '@httpreq/shared';
import { VariableInput } from './VariableInput';
import { fromBulkText, toBulkText } from './bulk';
import classes from './KeyValueTable.module.css';

export interface KeyValueTableProps<T extends KeyValueItem> {
  items: T[];
  onChange: (items: T[]) => void;
  /** Builds a new row (e.g. to add fields specific to multipart rows). */
  createRow?: (patch: Partial<KeyValueItem>) => T;
  label: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Suggestions for the key column (e.g. common header names). */
  keySuggestions?: readonly string[];
  /** Shows a per-row toggle that masks the value. */
  allowSecret?: boolean;
  showDescription?: boolean;
  allowBulkEdit?: boolean;
  /** Replaces the value cell for a row (e.g. a file picker). */
  renderValue?: (item: T, update: (patch: Partial<T>) => void) => ReactNode | undefined;
  /** Extra per-row controls before the row actions (e.g. text/file switch). */
  renderRowExtras?: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
  /** Message shown in a row, e.g. that the header is replaced by authorization. */
  rowNote?: (item: T) => string | undefined;
}

const defaultCreate = (patch: Partial<KeyValueItem>) =>
  ({ id: createId(), key: '', value: '', enabled: true, ...patch }) as KeyValueItem;

/**
 * Structured `✓ | Key | Value | Description` editor. A trailing empty row turns into a real row
 * as soon as something is typed into it (keeping focus), so empty placeholder rows are never
 * stored or counted.
 */
function KeyValueTableInner<T extends KeyValueItem>({
  items,
  onChange,
  createRow = defaultCreate as unknown as (patch: Partial<KeyValueItem>) => T,
  label,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  keySuggestions,
  allowSecret = false,
  showDescription = true,
  allowBulkEdit = true,
  renderValue,
  renderRowExtras,
  rowNote,
}: KeyValueTableProps<T>) {
  const [ghostId, setGhostId] = useState(createId);
  const [bulk, setBulk] = useState<string | null>(null);

  const update = (id: string, patch: Partial<T>) => {
    if (id === ghostId) {
      onChange([...items, { ...createRow({ id: ghostId }), ...patch }]);
      setGhostId(createId());
      return;
    }
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };
  const remove = (id: string) => onChange(items.filter((item) => item.id !== id));
  const duplicate = (id: string) => {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    const next = [...items];
    next.splice(index + 1, 0, { ...structuredClone(items[index]!), id: createId() });
    onChange(next);
  };

  const enabledCount = items.filter((item) => item.enabled && item.key.trim()).length;
  const allEnabled = items.length > 0 && items.every((item) => item.enabled);

  if (bulk !== null) {
    return (
      <div className={classes.root}>
        <Group justify="space-between" mb={6}>
          <Text size="xs" c="dimmed">
            One <code>key: value</code> per line. Prefix a line with <code>//</code> to disable it.
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => {
              onChange(fromBulkText(bulk, items, createRow));
              setBulk(null);
            }}
          >
            Key-value edit
          </Button>
        </Group>
        <Textarea
          aria-label={`${label} (bulk edit)`}
          value={bulk}
          onChange={(event) => setBulk(event.currentTarget.value)}
          onBlur={() => onChange(fromBulkText(bulk, items, createRow))}
          autosize
          minRows={6}
          className="hr-mono"
          autoFocus
        />
      </div>
    );
  }

  const rows = [...items, { ...createRow({ id: ghostId }) }];

  return (
    <div className={classes.root}>
      <div
        className={classes.table}
        role="table"
        aria-label={label}
        data-description={showDescription || undefined}
      >
        <div className={classes.header} role="row">
          <span role="columnheader" className={classes.check}>
            <Checkbox
              size="xs"
              aria-label={`Enable all ${label.toLowerCase()}`}
              checked={allEnabled}
              indeterminate={!allEnabled && items.some((item) => item.enabled)}
              disabled={!items.length}
              onChange={(event) =>
                onChange(items.map((item) => ({ ...item, enabled: event.currentTarget.checked })))
              }
            />
          </span>
          <span role="columnheader">Key</span>
          <span role="columnheader">Value</span>
          {showDescription && (
            <span role="columnheader" className={classes.description}>
              Description
            </span>
          )}
          <span role="columnheader" className={classes.actionsHeader}>
            {allowBulkEdit && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                onClick={() => setBulk(toBulkText(items))}
              >
                Bulk edit
              </Button>
            )}
          </span>
        </div>
        {rows.map((item) => {
          const ghost = item.id === ghostId;
          const patch = (value: Partial<T>) => update(item.id, value);
          const note = ghost ? undefined : rowNote?.(item);
          const customValue = renderValue?.(item, patch);
          return (
            <div
              key={item.id}
              role="row"
              className={classes.row}
              data-disabled={(!ghost && !item.enabled) || undefined}
              data-ghost={ghost || undefined}
            >
              <span role="cell" className={classes.check}>
                {!ghost && (
                  <Checkbox
                    size="xs"
                    aria-label={`Enable ${item.key || 'row'}`}
                    checked={item.enabled}
                    onChange={(event) => patch({ enabled: event.currentTarget.checked } as Partial<T>)}
                  />
                )}
              </span>
              <span role="cell" className={classes.cell}>
                {keySuggestions ? (
                  <Autocomplete
                    aria-label="Key"
                    placeholder={ghost ? `Add ${keyPlaceholder.toLowerCase()}` : keyPlaceholder}
                    value={item.key}
                    data={keySuggestions as string[]}
                    onChange={(key) => patch({ key } as Partial<T>)}
                    variant="unstyled"
                    size="xs"
                    classNames={{ input: classes.keyInput }}
                    comboboxProps={{ withinPortal: true, middlewares: { flip: true, shift: true } }}
                    limit={8}
                  />
                ) : (
                  <VariableInput
                    variant="cell"
                    aria-label="Key"
                    placeholder={ghost ? `Add ${keyPlaceholder.toLowerCase()}` : keyPlaceholder}
                    value={item.key}
                    onChange={(key) => patch({ key } as Partial<T>)}
                  />
                )}
              </span>
              <span role="cell" className={classes.cell}>
                {customValue ?? (
                  <VariableInput
                    variant="cell"
                    aria-label="Value"
                    placeholder={valuePlaceholder}
                    value={item.value}
                    masked={!!item.secret}
                    onChange={(value) => patch({ value } as Partial<T>)}
                  />
                )}
              </span>
              {showDescription && (
                <span role="cell" className={`${classes.cell} ${classes.description}`}>
                  <VariableInput
                    variant="cell"
                    mono={false}
                    completion={false}
                    aria-label="Description"
                    placeholder="Description"
                    value={item.description ?? ''}
                    onChange={(description) => patch({ description } as Partial<T>)}
                  />
                </span>
              )}
              <span role="cell" className={classes.actions}>
                {!ghost && (
                  <>
                    {note && (
                      <Tooltip label={note} multiline maw={260}>
                        <span className={classes.note} tabIndex={0} aria-label={note}>
                          !
                        </span>
                      </Tooltip>
                    )}
                    {renderRowExtras?.(item, patch)}
                    {allowSecret && (
                      <Tooltip label={item.secret ? 'Secret: masked and not saved to disk' : 'Mark as secret'}>
                        <ActionIcon
                          variant="subtle"
                          color={item.secret ? 'violet' : 'gray'}
                          size="sm"
                          aria-label={item.secret ? 'Unmark secret' : 'Mark as secret'}
                          aria-pressed={!!item.secret}
                          onClick={() => patch({ secret: !item.secret } as Partial<T>)}
                        >
                          {item.secret ? <IconLock size={14} /> : <IconLockOpen size={14} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Tooltip label="Duplicate">
                      <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Duplicate row" onClick={() => duplicate(item.id)}>
                        <IconCopy size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Remove">
                      <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Remove row" onClick={() => remove(item.id)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <Text size="xs" c="dimmed" mt={6} aria-live="polite">
        {enabledCount} enabled
      </Text>
    </div>
  );
}

export const KeyValueTable = memo(KeyValueTableInner) as typeof KeyValueTableInner;
