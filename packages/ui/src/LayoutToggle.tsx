import { ActionIcon, Tooltip } from '@mantine/core';
import { IconLayoutColumns, IconLayoutRows } from '@tabler/icons-react';
import { memo, useRef, type KeyboardEvent } from 'react';
import { usePreferences, type ResponsePosition } from './preferences';
import classes from './LayoutToggle.module.css';

const options: { value: ResponsePosition; label: string; icon: typeof IconLayoutColumns }[] = [
  { value: 'right', label: 'Response right', icon: IconLayoutColumns },
  { value: 'bottom', label: 'Response bottom', icon: IconLayoutRows },
];

/** Icon-only radio group choosing the application-wide response panel position. */
export const LayoutToggle = memo(function LayoutToggle() {
  const value = usePreferences((state) => state.responsePosition);
  const setValue = usePreferences((state) => state.setResponsePosition);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + 1) % options.length]!;
    setValue(next.value);
    refs.current[options.indexOf(next)]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Response panel position"
      className={classes.group}
      onKeyDown={onKeyDown}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <Tooltip key={option.value} label={option.label}>
            <ActionIcon
              ref={(element) => {
                refs.current[index] = element;
              }}
              role="radio"
              aria-checked={checked}
              aria-label={option.label}
              tabIndex={checked ? 0 : -1}
              variant={checked ? 'light' : 'subtle'}
              color={checked ? undefined : 'gray'}
              radius={0}
              className={classes.button}
              data-checked={checked || undefined}
              onClick={() => setValue(option.value)}
            >
              <option.icon size={16} aria-hidden />
            </ActionIcon>
          </Tooltip>
        );
      })}
    </div>
  );
});
