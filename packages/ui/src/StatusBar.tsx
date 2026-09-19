import { Tooltip } from '@mantine/core';
import { IconLayoutColumns, IconLayoutRows, IconLoader2 } from '@tabler/icons-react';
import { memo } from 'react';
import { recheckConnectivity, useConnectivity, type ConnectivityStatus } from './connectivity';
import { usePreferences } from './preferences';
import classes from './StatusBar.module.css';

const statusText: Record<ConnectivityStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  checking: 'Checking…',
};

const statusHint: Record<ConnectivityStatus, string> = {
  online: 'The internet is reachable.',
  offline: 'No internet connection. You can keep editing; sending will fail until it returns.',
  checking: 'Checking the internet connection…',
};

interface Props {
  workspaceName: string;
  runtimeLabel: string;
  version?: string;
  sending: boolean;
}

/** Compact VS Code-style status bar. Only this component re-renders on connectivity changes. */
export const StatusBar = memo(function StatusBar({
  workspaceName,
  runtimeLabel,
  version,
  sending,
}: Props) {
  const status = useConnectivity((state) => state.status);
  const layout = usePreferences((state) => state.responsePosition);
  const setLayout = usePreferences((state) => state.setResponsePosition);
  const nextLayout = layout === 'right' ? 'bottom' : 'right';

  return (
    <div className={classes.bar}>
      <div className={classes.group}>
        <Tooltip label={`${statusHint[status]} Select to check again.`} openDelay={300}>
          <button
            type="button"
            className={classes.item}
            data-status={status}
            aria-label={`Connection: ${statusText[status]}. Select to check again.`}
            onClick={() => void recheckConnectivity()}
          >
            <span className={classes.dot} aria-hidden />
            <span aria-live="polite">{statusText[status]}</span>
          </button>
        </Tooltip>
        <span className={classes.text}>
          <span className={classes.label}>Workspace:</span> {workspaceName}
        </span>
        <span className={classes.text}>{runtimeLabel}</span>
        {sending && (
          <span className={classes.text} role="status">
            <IconLoader2 size={12} className={classes.spin} aria-hidden /> Sending…
          </span>
        )}
      </div>
      <div className={classes.group}>
        <button
          type="button"
          className={classes.item}
          aria-label={`Response panel: ${layout}. Select to move it to the ${nextLayout}.`}
          title={`Move response to the ${nextLayout}`}
          onClick={() => setLayout(nextLayout)}
        >
          {layout === 'right' ? (
            <IconLayoutColumns size={13} aria-hidden />
          ) : (
            <IconLayoutRows size={13} aria-hidden />
          )}
          Response {layout === 'right' ? 'Right' : 'Bottom'}
        </button>
        {version && <span className={classes.text}>HttpReq v{version}</span>}
      </div>
    </div>
  );
});
