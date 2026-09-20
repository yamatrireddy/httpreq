import { Tooltip } from '@mantine/core';
import {
  IconBolt,
  IconLayoutColumns,
  IconLayoutRows,
  IconLoader2,
  IconRouter,
  IconServer,
} from '@tabler/icons-react';
import { memo } from 'react';
import { useCapabilities } from './capabilities';
import { useShallow } from 'zustand/react/shallow';
import { activeConnectionCounts, useConnectionsStore } from './connections';
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

/** One live-connection counter. Hidden at zero, so the bar stays quiet when nothing is running. */
function ConnectionCount({
  count,
  icon: Icon,
  singular,
  plural,
}: {
  count: number;
  icon: typeof IconBolt;
  singular: string;
  plural: string;
}) {
  if (count === 0) return null;
  const label = `${count} ${count === 1 ? singular : plural}`;
  return (
    <Tooltip label={label} openDelay={300}>
      <span className={classes.text} aria-label={label}>
        <Icon size={12} aria-hidden /> {count}
      </span>
    </Tooltip>
  );
}

/** Compact VS Code-style status bar. Only this component re-renders on connectivity changes. */
export const StatusBar = memo(function StatusBar({
  workspaceName,
  runtimeLabel,
  version,
  sending,
}: Props) {
  const status = useConnectivity((state) => state.status);
  // Shallow-compared: the selector derives a fresh object, so it needs a stable comparison.
  const counts = useConnectionsStore(useShallow(activeConnectionCounts));
  const capabilities = useCapabilities();
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
        <ConnectionCount
          count={counts.webSockets}
          icon={IconBolt}
          singular="WebSocket connected"
          plural="WebSockets connected"
        />
        {capabilities.ssh && (
          <ConnectionCount
            count={counts.sshSessions}
            icon={IconServer}
            singular="SSH session connected"
            plural="SSH sessions connected"
          />
        )}
        {capabilities.tunneling && (
          <ConnectionCount
            count={counts.tunnels}
            icon={IconRouter}
            singular="tunnel active"
            plural="tunnels active"
          />
        )}
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
