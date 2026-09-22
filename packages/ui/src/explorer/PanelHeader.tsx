import { Text } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './Sidebar.module.css';

/**
 * The title strip at the top of every sidebar view (collections, environments, history, SSH,
 * tunnels). One component, so every view has the same height, rule and type, and that strip lines
 * up with the request tab strip beside it whichever view is open.
 */
export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={classes.panelHeader}>
      <Text component="h2" className={classes.panelTitle}>
        {title}
      </Text>
      {children}
    </div>
  );
}
