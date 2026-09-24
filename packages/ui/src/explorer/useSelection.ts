import { useCallback, useMemo, useState } from 'react';

export interface Selection {
  /** Whether the panel is in selection mode (checkboxes instead of its usual row actions). */
  selecting: boolean;
  start: () => void;
  stop: () => void;
  /** Selected ids that still exist, in the order of the list. */
  ids: string[];
  count: number;
  total: number;
  allSelected: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
}

/**
 * Multi-selection over a list of ids. Ids that disappear from the list (deleted elsewhere, or
 * filtered out) drop out of the selection, so a bulk action only ever sees live, visible items.
 */
export const useSelection = (allIds: string[]): Selection => {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const ids = useMemo(() => allIds.filter((id) => picked.has(id)), [allIds, picked]);
  const allSelected = allIds.length > 0 && ids.length === allIds.length;

  const stop = useCallback(() => {
    setSelecting(false);
    setPicked(new Set());
  }, []);
  const toggle = useCallback(
    (id: string) =>
      setPicked((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  return {
    selecting,
    start: () => setSelecting(true),
    stop,
    ids,
    count: ids.length,
    total: allIds.length,
    allSelected,
    isSelected: (id) => picked.has(id),
    toggle,
    toggleAll: () => setPicked(allSelected ? new Set() : new Set(allIds)),
  };
};
