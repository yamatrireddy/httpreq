import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createWorkspace } from '@httpreq/workspace';
import { useWorkbenchStore } from '../store';
import { EnvironmentsPanel } from './EnvironmentsPanel';

const state = () => useWorkbenchStore.getState();

describe('editing environments', () => {
  beforeEach(() => {
    act(() => state().load(createWorkspace('Alpha'), {}, []));
    render(
      <MantineProvider>
        <EnvironmentsPanel />
      </MantineProvider>,
    );
  });

  it('edits a new environment inline, with no dialog, starting at its name', () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'New environment' })[0]!);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const name = screen.getByLabelText('Name');
    expect(name).toHaveFocus();
    fireEvent.change(name, { target: { value: 'Staging' } });
    fireEvent.change(screen.getByPlaceholderText('Add variable'), {
      target: { value: 'base_url' },
    });

    const [environment] = state().workspace.environments;
    expect(environment!.name).toBe('Staging');
    expect(environment!.variables.map((variable) => variable.key)).toEqual(['base_url']);
  });

  it('opens and closes an environment’s editor from its row', () => {
    act(() => {
      state().createEnvironment();
    });
    const row = screen.getByRole('button', { name: /^New Environment\s*\d/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Edit New Environment' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('group', { name: /^Edit / })).not.toBeInTheDocument();
  });
});
