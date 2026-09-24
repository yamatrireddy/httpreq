import { Loader, Skeleton, Text } from '@mantine/core';
import classes from './EditorLoading.module.css';

const LINES = [62, 84, 45, 70, 38, 56];

/**
 * Shown in an editor's place while Monaco loads: the shape of a few lines of code and a label,
 * so the panel reads as “coming” rather than empty or frozen.
 */
export function EditorLoading({ label = 'Loading editor…' }: { label?: string }) {
  return (
    <div className={classes.root} role="status" aria-live="polite" aria-label={label}>
      <div className={classes.lines} aria-hidden>
        {LINES.map((width, index) => (
          <Skeleton key={index} height={9} width={`${width}%`} radius="xs" animate />
        ))}
      </div>
      <div className={classes.label}>
        <Loader size={12} />
        <Text size="xs" c="dimmed">
          {label}
        </Text>
      </div>
    </div>
  );
}
