import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createWorkspace } from '@httpreq/workspace';
import { useWorkbenchStore } from '../store';
import { EnvironmentEditor } from '../environment/EnvironmentEditor';
import { EnvironmentsPanel } from './EnvironmentsPanel';

const state = () => useWorkbenchStore.getState();

/** The sidebar list, and the editor of whichever environment tab is active (as the shell does). */
function Harness() {
  const activeTab = useWorkbenchStore((current) => current.activeEnvironmentTabId);
  return (
    <>
      <EnvironmentsPanel />
      {activeTab && <EnvironmentEditor key={activeTab} environmentId={activeTab} />}
    </>
  );
}

describe('editing environments', () => {
  beforeEach(() => {
    act(() => state().load(createWorkspace('Alpha'), {}, []));
    render(
      <MantineProvider>
        <Harness />
      </MantineProvider>,
    );
  });

  it('opens a new environment in its own tab, with no dialog, starting at its name', () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'New environment' })[0]!);

    const [environment] = state().workspace.environments;
    expect(state().openEnvironmentTabIds).toEqual([environment!.id]);
    expect(state().activeEnvironmentTabId).toBe(environment!.id);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const name = screen.getByLabelText('Environment name');
    expect(name).toHaveFocus();
    fireEvent.change(name, { target: { value: 'Staging' } });
    fireEvent.change(screen.getByPlaceholderText('Add variable'), {
      target: { value: 'base_url' },
    });

    const saved = state().workspace.environments[0]!;
    expect(saved.name).toBe('Staging');
    expect(saved.variables.map((variable) => variable.key)).toEqual(['base_url']);
  });

  it('keeps one tab per environment, so several can be open at once', () => {
    act(() => {
      state().updateEnvironment(state().createEnvironment(), { name: 'Development' });
      state().updateEnvironment(state().createEnvironment(), { name: 'Production' });
    });
    const [development, production] = state().workspace.environments;

    fireEvent.click(screen.getByRole('button', { name: /^Development\s*\d/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Production\s*\d/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Development\s*\d/ }));

    expect(state().openEnvironmentTabIds).toEqual([development!.id, production!.id]);
    expect(state().activeEnvironmentTabId).toBe(development!.id);
    expect(screen.getByLabelText('Environment name')).toHaveValue('Development');
  });
});
