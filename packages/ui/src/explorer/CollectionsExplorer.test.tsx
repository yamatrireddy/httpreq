import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createWorkspace } from '@httpreq/workspace';
import { useWorkbenchStore } from '../store';
import { CollectionsExplorer } from './CollectionsExplorer';

const state = () => useWorkbenchStore.getState();

const mount = () => {
  act(() => state().load(createWorkspace('Alpha'), {}, []));
  let collection = '';
  let folder = '';
  let nested = '';
  act(() => {
    collection = state().createCollection();
    folder = state().createFolder(collection);
    nested = state().createFolder(folder);
    state().renameNode(collection, 'Api');
    state().renameNode(folder, 'Users');
    state().renameNode(nested, 'Admins');
    state().setRenaming(null);
  });
  render(
    <MantineProvider>
      <CollectionsExplorer onOpenSettings={() => undefined} />
    </MantineProvider>,
  );
  return { collection, folder, nested };
};

const folderName = (id: string) => state().workspace.folders.find((item) => item.id === id)?.name;

describe('renaming in the collections explorer', () => {
  beforeEach(() => {
    act(() => state().setRenaming(null));
  });

  it.each(['folder', 'nested'] as const)('renames a %s from its actions menu', async (which) => {
    const ids = mount();
    const id = ids[which];
    const name = folderName(id)!;
    // A real click focuses the button; the menu hands focus back to it when it closes.
    const trigger = screen.getByRole('button', { name: `Actions for ${name}` });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText('Rename'));
    const input = (await screen.findByLabelText(`Rename ${name}`)) as HTMLInputElement;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(folderName(id)).toBe('Renamed'));
  });
});
