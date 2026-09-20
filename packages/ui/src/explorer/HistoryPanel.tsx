import { Button, Text, UnstyledButton } from '@mantine/core';
import { Fragment, useMemo } from 'react';
import { methodColor } from '../methods';
import { useWorkbenchStore } from '../store';
import classes from './Sidebar.module.css';

const dayLabel = (date: Date) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

export function HistoryPanel({
  onClear,
  onOpened,
}: {
  onClear: () => void;
  onOpened?: () => void;
}) {
  const history = useWorkbenchStore((state) => state.history);
  const requests = useWorkbenchStore((state) => state.workspace.requests);
  const openRequest = useWorkbenchStore((state) => state.openRequest);
  const names = useMemo(
    () => new Map(requests.map((request) => [request.id, request.name])),
    [requests],
  );

  let lastDay = '';
  return (
    <div className={classes.explorer}>
      <div className={classes.panelHeader}>
        <Text component="h2" className={classes.panelTitle}>
          History
        </Text>
        {history.length > 0 && (
          <Button size="compact-xs" variant="subtle" color="gray" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      <div className={classes.tree} role="list" aria-label="Request history">
        {history.length === 0 && (
          <Text size="xs" c="dimmed" px={12} py={4}>
            Sent requests appear here.
          </Text>
        )}
        {history.map((entry) => {
          const date = new Date(entry.timestamp);
          const day = dayLabel(date);
          const heading = day !== lastDay;
          lastDay = day;
          // Names are looked up by id, so renamed requests show their current name.
          const current = names.get(entry.requestId);
          return (
            <Fragment key={entry.id}>
              {heading && <div className={classes.sectionHeading}>{day}</div>}
              <UnstyledButton
                role="listitem"
                className={classes.historyRow}
                disabled={!current}
                onClick={() => {
                  openRequest(entry.requestId);
                  onOpened?.();
                }}
                title={current ? `${entry.method} ${entry.url}` : 'This request was deleted'}
              >
                <span
                  className={classes.method}
                  style={{ color: `var(--mantine-color-${methodColor[entry.method]}-text)` }}
                >
                  {entry.method === 'DELETE'
                    ? 'DEL'
                    : entry.method === 'OPTIONS'
                      ? 'OPT'
                      : entry.method}
                </span>
                <span className={classes.rowName} data-deleted={!current || undefined}>
                  {current ?? entry.name}
                </span>
                <Text
                  span
                  size="xs"
                  c={entry.status === null ? 'red' : entry.status < 400 ? 'teal' : 'red'}
                >
                  {entry.status ?? 'ERR'}
                </Text>
                <Text span size="xs" c="dimmed">
                  {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </UnstyledButton>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
