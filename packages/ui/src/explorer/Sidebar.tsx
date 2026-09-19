import { Tooltip, UnstyledButton } from '@mantine/core';
import { IconBolt, IconFolders, IconHistory, IconServer, IconVariable } from '@tabler/icons-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clampSidebarWidth, usePreferences } from '../preferences';
import { useWorkbenchStore, type SidebarView } from '../store';
import { CollectionsExplorer } from './CollectionsExplorer';
import { ContainerSettingsDialog } from './ContainerSettingsDialog';
import { EnvironmentsPanel } from './EnvironmentsPanel';
import { HistoryPanel } from './HistoryPanel';
import classes from './Sidebar.module.css';

const VIEWS: { id: SidebarView; label: string; icon: typeof IconFolders }[] = [
  { id: 'collections', label: 'Collections', icon: IconFolders },
  { id: 'environments', label: 'Environments', icon: IconVariable },
  { id: 'history', label: 'History', icon: IconHistory },
];

const UPCOMING = [
  { label: 'WebSockets', icon: IconBolt },
  { label: 'SSH', icon: IconServer },
];

const KEYBOARD_STEP = 16;

interface Props {
  onClearHistory: () => void;
  /** Closes the navigation drawer on small screens after something was opened. */
  onNavigate?: () => void;
}

/** Activity rail + the selected view, with a resize handle on the right edge. */
export function Sidebar({ onClearHistory, onNavigate }: Props) {
  const view = useWorkbenchStore((state) => state.sidebarView);
  const setView = useWorkbenchStore((state) => state.setSidebarView);
  const width = usePreferences((state) => state.sidebarWidth);
  const setWidth = usePreferences((state) => state.setSidebarWidth);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const drag = useRef<{ startX: number; startWidth: number; width: number } | null>(null);

  // While dragging, only the AppShell's CSS variables change, so nothing re-renders; the width
  // is committed to preferences once, on release.
  const applyWidth = (next: number) => {
    const style = document.documentElement.style;
    style.setProperty('--app-shell-navbar-width', `${next}px`);
    style.setProperty('--app-shell-navbar-offset', `${next}px`);
  };
  const clearOverride = () => {
    const style = document.documentElement.style;
    style.removeProperty('--app-shell-navbar-width');
    style.removeProperty('--app-shell-navbar-offset');
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width, width };
    document.body.dataset.resizing = 'col';
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = clampSidebarWidth(drag.current.startWidth + event.clientX - drag.current.startX);
    drag.current.width = next;
    applyWidth(next);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    setWidth(drag.current.width);
    drag.current = null;
    delete document.body.dataset.resizing;
    // Let the AppShell pick up the committed width before removing the temporary override.
    requestAnimationFrame(clearOverride);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setWidth(width + (event.key === 'ArrowRight' ? KEYBOARD_STEP : -KEYBOARD_STEP));
    }
  };

  return (
    <div className={classes.sidebar}>
      <nav className={classes.rail} aria-label="Sidebar views">
        {VIEWS.map((item) => (
          <Tooltip key={item.id} label={item.label} position="right">
            <UnstyledButton
              className={classes.railButton}
              data-active={view === item.id || undefined}
              aria-label={item.label}
              aria-pressed={view === item.id}
              onClick={() => setView(item.id)}
            >
              <item.icon size={19} stroke={1.6} />
            </UnstyledButton>
          </Tooltip>
        ))}
        <div className={classes.railSpacer} />
        {UPCOMING.map((item) => (
          <Tooltip key={item.label} label={`${item.label} (coming soon)`} position="right">
            <UnstyledButton className={classes.railButton} aria-label={`${item.label}, coming soon`} data-disabled>
              <item.icon size={19} stroke={1.6} />
            </UnstyledButton>
          </Tooltip>
        ))}
      </nav>

      <div className={classes.panel}>
        {view === 'collections' && <CollectionsExplorer onOpenSettings={setSettingsId} onOpened={onNavigate} />}
        {view === 'environments' && <EnvironmentsPanel />}
        {view === 'history' && <HistoryPanel onClear={onClearHistory} onOpened={onNavigate} />}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={220}
        aria-valuemax={560}
        aria-valuenow={width}
        tabIndex={0}
        className={classes.resizer}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={() => setWidth(300)}
      />
      <ContainerSettingsDialog nodeId={settingsId} onClose={() => setSettingsId(null)} />
    </div>
  );
}
