import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultWorkspace } from '@httpreq/workspace';
import { useWorkbenchStore } from './store';

const state = () => useWorkbenchStore.getState();
const ids = () => state().workspace.requests.map((request) => request.id);

describe('workbench store', () => {
  beforeEach(() => {
    state().setWorkspace(createDefaultWorkspace());
    state().addRequest();
    state().addRequest();
  });

  it('cycles through requests in both directions with wrap-around', () => {
    const [first, second, third] = ids();
    expect(state().activeRequestId).toBe(third);
    state().cycleRequest(1);
    expect(state().activeRequestId).toBe(first);
    state().cycleRequest(-1);
    expect(state().activeRequestId).toBe(third);
    state().cycleRequest(-1);
    expect(state().activeRequestId).toBe(second);
  });

  it('reorders requests without changing the active one', () => {
    const [first, second, third] = ids();
    state().moveRequest(third!, 0);
    expect(ids()).toEqual([third, first, second]);
    expect(state().activeRequestId).toBe(third);
  });

  it('duplicates a request next to the original and selects the copy', () => {
    const [first] = ids();
    state().updateRequest(first!, { url: 'https://example.com' });
    state().duplicateRequest(first!);
    const requests = state().workspace.requests;
    expect(requests).toHaveLength(4);
    expect(requests[1]!.url).toBe('https://example.com');
    expect(requests[1]!.id).not.toBe(first);
    expect(state().activeRequestId).toBe(requests[1]!.id);
  });

  it('tracks unsaved edits until the saved snapshot matches', () => {
    const [first] = ids();
    state().updateRequest(first!, { url: 'https://a.example' });
    const snapshot = state().workspace;
    state().updateRequest(first!, { url: 'https://b.example' });
    state().markSaved(snapshot);
    expect(state().unsavedIds.has(first!)).toBe(true);
    state().markSaved(state().workspace);
    expect(state().unsavedIds.has(first!)).toBe(false);
  });
});
