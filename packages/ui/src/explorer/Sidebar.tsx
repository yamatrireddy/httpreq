import { Tooltip, UnstyledButton } from '@mantine/core';
import {
  IconFolders,
  IconHistory,
  IconRouter,
  IconServer,
  IconVariable,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useCapabilities } from '../capabilities';
import { clampSidebarWidth, usePreferences } from '../preferences';
import { SshPanel } from '../ssh/SshPanel';
import { TunnelsPanel } from '../tunnels/TunnelsPanel';
import { DESKTOP_SIDEBAR_VIEWS, useWorkbenchStore, type SidebarView } from '../store';
import { CollectionsExplorer } from './CollectionsExplorer';
import { ContainerSettingsDialog } from './ContainerSettingsDialog';
import { EnvironmentsPanel } from './EnvironmentsPanel';
import { HistoryPanel } from './HistoryPanel';
import classes from './Sidebar.module.css';

interface ViewDefinition {
  id: SidebarView;
  label: string;
  icon: typeof IconFolders;
  /** Only shown when the platform supports it; the browser sees it disabled instead. */
  desktopOnly?: boolean;
}

const VIEWS: ViewDefinition[] = [
  { id: 'collections', label: 'Collections', icon: IconFolders },
  { id: 'environments', label: 'Environments', icon: IconVariable },
  { id: 'history', label: 'History', icon: IconHistory },
  { id: 'ssh', label: 'SSH', icon: IconServer, desktopOnly: true },
  { id: 'tunnels', label: 'Tunnels', icon: IconRouter, desktopOnly: true },
];

const KEYBOARD_STEP = 16;

interface Props {
  onClearHistory: () => void;
  onRemoveHistory: (entryIds: string[]) => Promise<void>;
  /** Closes the navigation drawer on small screens after something was opened. */
  onNavigate?: () => void;
}

/** Activity rail + the selected view, with a resize handle on the right edge. */
export function Sidebar({ onClearHistory, onRemoveHistory, onNavigate }: Props) {
  const view = useWorkbenchStore((state) => state.sidebarView);
  const setView = useWorkbenchStore((state) => state.setSidebarView);
  const capabilities = useCapabilities();
  const desktopViews = capabilities.ssh;

  // A stored view from a desktop session must not leave the browser on an empty panel.
  useEffect(() => {
    if (!desktopViews && DESKTOP_SIDEBAR_VIEWS.includes(view)) setView('collections');
  }, [desktopViews, setView, view]);
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
        {VIEWS.map((item) => {
          const unavailable = !!item.desktopOnly && !desktopViews;
          return (
            <Tooltip
              key={item.id}
              label={unavailable ? `${item.label} (desktop app only)` : item.label}
              position="right"
            >
              <UnstyledButton
                className={classes.railButton}
                data-active={(!unavailable && view === item.id) || undefined}
                data-disabled={unavailable || undefined}
                aria-label={unavailable ? `${item.label}, desktop app only` : item.label}
                aria-pressed={!unavailable && view === item.id}
                aria-disabled={unavailable || undefined}
                onClick={() => {
                  if (!unavailable) setView(item.id);
                }}
              >
                <item.icon size={19} stroke={1.6} />
              </UnstyledButton>
            </Tooltip>
          );
        })}
        <div className={classes.railSpacer} />
      </nav>

      <div className={classes.panel}>
        {view === 'collections' && (
          <CollectionsExplorer onOpenSettings={setSettingsId} onOpened={onNavigate} />
        )}
        {view === 'environments' && <EnvironmentsPanel onOpened={onNavigate} />}
        {view === 'history' && (
          <HistoryPanel onClear={onClearHistory} onRemove={onRemoveHistory} onOpened={onNavigate} />
        )}
        {view === 'ssh' && desktopViews && <SshPanel onOpened={onNavigate} />}
        {view === 'tunnels' && desktopViews && <TunnelsPanel />}
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
