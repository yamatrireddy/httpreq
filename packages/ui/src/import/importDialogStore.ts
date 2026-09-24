import { create } from 'zustand';

export type ImportMode = 'curl' | 'files';

interface ImportDialogState {
  opened: boolean;
  mode: ImportMode;
}

export const useImportDialog = create<ImportDialogState>(() => ({ opened: false, mode: 'files' }));

/** Opens the Import dialog, from the File menu, the collections panel or anywhere else. */
export const openImportDialog = (mode?: ImportMode) =>
  useImportDialog.setState((state) => ({ opened: true, mode: mode ?? state.mode }));

export const closeImportDialog = () => useImportDialog.setState({ opened: false });
