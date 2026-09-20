import { Select } from '@mantine/core';
import { IconVariable } from '@tabler/icons-react';
import { memo } from 'react';
import { useWorkbenchStore } from './store';
import classes from './EnvironmentSelect.module.css';

const NONE = '__none__';

/** Compact active-environment picker for the tab strip. */
export const EnvironmentSelect = memo(function EnvironmentSelect() {
  const environments = useWorkbenchStore((state) => state.workspace.environments);
  const activeId = useWorkbenchStore((state) => state.workspace.activeEnvironmentId);
  const setActive = useWorkbenchStore((state) => state.setActiveEnvironment);
  return (
    <Select
      aria-label="Active environment"
      className={classes.select}
      size="xs"
      w={170}
      mx={6}
      leftSection={<IconVariable size={14} />}
      value={activeId ?? NONE}
      allowDeselect={false}
      data={[
        { value: NONE, label: 'No environment' },
        ...environments.map((environment) => ({ value: environment.id, label: environment.name })),
      ]}
      onChange={(value) => setActive(!value || value === NONE ? null : value)}
      comboboxProps={{ withinPortal: true, position: 'bottom-end', middlewares: { flip: true, shift: true } }}
    />
  );
});
