import { ActionIcon, Burger, Tooltip, useComputedColorScheme } from '@mantine/core';
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMoon,
  IconSettings,
  IconSun,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DesktopBridge, DesktopWindowState } from '@httpreq/shared';
import { AppLogo } from './AppLogo';
import type { CommandMap } from './commands';
import { MenuBar, type MenuDefinition } from './MenuBar';
import classes from './TitleBar.module.css';

interface Props {
  title: string;
  /** Centred in the bar, independently of what sits on either side: the workspace switcher. */
  center?: ReactNode;
  menus: MenuDefinition[];
  commands: CommandMap;
  mac: boolean;
  desktop?: DesktopBridge;
  sidebarVisible: boolean;
  mobileNavOpened: boolean;
  onToggleMobileNav: () => void;
}

const toHex = (color: string) => {
  const channels = color
    .match(/\d+(\.\d+)?/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length < 3) return undefined;
  return `#${channels.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Integrated title bar. In Electron it is the window's drag region, hosts the application menu
 * on Windows and Linux (macOS keeps its native global menu), and leaves room for the native
 * window controls: the traffic lights on macOS, the window-controls overlay elsewhere.
 *
 * The bar is three zones. The outer two share the leftover space equally, which keeps the middle
 * one centred in the window at any width without taking it out of the flow — so it can never
 * overlap the menu, the window controls or the traffic lights, and simply gives up width (and
 * truncates) when the sides need it.
 */
export function TitleBar({
  title,
  center,
  menus,
  commands,
  mac,
  desktop,
  sidebarVisible,
  mobileNavOpened,
  onToggleMobileNav,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const colorScheme = useComputedColorScheme('dark');
  const [windowState, setWindowState] = useState<DesktopWindowState>({
    maximized: false,
    fullscreen: false,
  });

  useEffect(() => {
    if (!desktop) return;
    void desktop.getWindowState().then((state) => state && setWindowState(state));
    return desktop.onWindowStateChange(setWindowState);
  }, [desktop]);

  // Keep the native window-controls overlay in the same colours as the React title bar.
  useEffect(() => {
    if (!desktop || mac || !ref.current) return;
    const style = getComputedStyle(ref.current);
    const color = toHex(style.backgroundColor);
    const symbolColor = toHex(style.color);
    if (color && symbolColor) desktop.setTitleBarTheme({ color, symbolColor });
  }, [desktop, mac, colorScheme]);

  const toggleSidebar = commands['view.toggle-sidebar'];
  const toggleTheme = commands['view.toggle-theme'];
  const settings = commands['tools.settings'];

  return (
    <div
      ref={ref}
      className={classes.titleBar}
      data-desktop={desktop ? 'true' : undefined}
      data-mac={mac || undefined}
      data-fullscreen={windowState.fullscreen || undefined}
    >
      <div className={`${classes.side} ${classes.sideStart}`}>
        {desktop && mac && !windowState.fullscreen && <div className={classes.trafficLights} />}
        <Burger
          opened={mobileNavOpened}
          onClick={onToggleMobileNav}
          hiddenFrom="sm"
          size="xs"
          className={classes.noDrag}
          aria-label={mobileNavOpened ? 'Close navigation' : 'Open navigation'}
        />
        <div className={classes.brand}>
          <AppLogo size={18} />
          {(mac || !desktop) && <span className={classes.appName}>HttpReq</span>}
        </div>
        {!mac && (
          <MenuBar menus={menus} commands={commands} mac={mac} altKeyNavigation={!!desktop} />
        )}
        <div className={classes.title} title={title}>
          {title}
        </div>
      </div>

      {center && <div className={classes.center}>{center}</div>}

      <div className={`${classes.side} ${classes.sideEnd}`}>
        <div className={classes.actions}>
          {toggleSidebar && (
            <Tooltip label={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="md"
                radius={0}
                visibleFrom="sm"
                aria-label="Toggle sidebar"
                aria-pressed={sidebarVisible}
                onClick={toggleSidebar.run}
              >
                {sidebarVisible ? (
                  <IconLayoutSidebarLeftCollapse size={17} />
                ) : (
                  <IconLayoutSidebarLeftExpand size={17} />
                )}
              </ActionIcon>
            </Tooltip>
          )}
          {toggleTheme && (
            <Tooltip label="Toggle color scheme">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="md"
                radius={0}
                aria-label="Toggle color scheme"
                onClick={toggleTheme.run}
              >
                {colorScheme === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
              </ActionIcon>
            </Tooltip>
          )}
          {settings && (
            <Tooltip label="Settings">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="md"
                radius={0}
                aria-label="Settings"
                onClick={settings.run}
              >
                <IconSettings size={17} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
        {desktop && !mac && <div className={classes.windowControls} />}
      </div>
    </div>
  );
}
