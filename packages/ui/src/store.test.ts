import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultWorkspace } from '@httpreq/workspace';
import { editableRequest, useWorkbenchStore } from './store';

const state = () => useWorkbenchStore.getState();
const openIds = () => state().workspace.openRequestIds;

describe('workbench store', () => {
  beforeEach(() => {
    state().load(createDefaultWorkspace(), {}, []);
  });

  it('opens new requests next to the active tab and cycles with wrap-around', () => {
    const [first] = openIds();
    const second = state().createRequest(null);
    const third = state().createRequest(null);
    expect(openIds()).toEqual([first, second, third]);
    expect(state().activeRequestId).toBe(third);
    state().cycleRequest(1);
    expect(state().activeRequestId).toBe(first);
    state().cycleRequest(-1);
    expect(state().activeRequestId).toBe(third);
  });

  it('reorders tabs without changing the active one', () => {
    const [first] = openIds();
    const second = state().createRequest(null);
    state().moveTab(second, 0);
    expect(openIds()).toEqual([second, first]);
    expect(state().activeRequestId).toBe(second);
  });

  it('keeps edits in a draft until they match the saved request again', () => {
    const [id] = openIds();
    const saved = state().workspace.requests[0]!;
    state().editRequest(id!, { url: 'https://changed.example' });
    expect(state().drafts[id!]).toBeDefined();
    expect(state().workspace.requests[0]).toBe(saved);
    expect(editableRequest(state(), id!)!.url).toBe('https://changed.example');
    state().editRequest(id!, { url: saved.url });
    expect(state().drafts[id!]).toBeUndefined();
  });

  it('renames the saved request and its draft together', () => {
    const [id] = openIds();
    state().editRequest(id!, { url: 'https://draft.example' });
    state().renameNode(id!, 'adminLogin');
    expect(state().workspace.requests[0]!.name).toBe('adminLogin');
    expect(state().drafts[id!]!.name).toBe('adminLogin');
  });

  it('commits a saved draft and clears the modified state', () => {
    const [id] = openIds();
    state().editRequest(id!, { method: 'POST' });
    const draft = state().drafts[id!]!;
    const base = state().workspace;
    const written = { ...base, requests: base.requests.map((request) => (request.id === id ? draft : request)) };
    state().setSaveStatus(id!, 'saving');
    state().commitSaved(draft, draft, written, base);
    expect(state().workspace).toBe(written);
    expect(state().drafts[id!]).toBeUndefined();
    expect(state().saveStatus[id!]).toBeUndefined();
  });

  it('closes tabs without deleting saved requests, but drops pristine scratch requests', () => {
    const [saved] = openIds();
    const scratch = state().createRequest(null);
    state().closeRequest(scratch);
    expect(state().workspace.requests.some((request) => request.id === scratch)).toBe(false);
    state().closeRequest(saved!);
    expect(openIds()).toEqual([]);
    expect(state().activeRequestId).toBeNull();
    expect(state().workspace.requests.some((request) => request.id === saved)).toBe(true);
  });

  it('deleting a collection closes its tabs and drafts', () => {
    const collectionId = state().workspace.collections[0]!.id;
    const [id] = openIds();
    state().editRequest(id!, { url: 'x' });
    state().deleteNode(collectionId);
    expect(openIds()).toEqual([]);
    expect(state().drafts).toEqual({});
    expect(state().activeRequestId).toBeNull();
  });

  it('reveals a node by expanding its ancestors', () => {
    const collectionId = state().workspace.collections[0]!.id;
    const folderId = state().createFolder(collectionId);
    const requestId = state().createRequest(folderId);
    useWorkbenchStore.setState({ expandedIds: new Set() });
    state().revealNode(requestId);
    expect([...state().expandedIds].sort()).toEqual([collectionId, folderId].sort());
    expect(state().selectedNodeId).toBe(requestId);
  });

  it('stores retrieved tokens in the active environment as secrets', () => {
    expect(state().setEnvironmentVariable('accessToken', 'tok', true)).toBe(true);
    const variable = state().workspace.environments[0]!.variables.find((item) => item.key === 'accessToken');
    expect(variable).toMatchObject({ value: 'tok', secret: true, enabled: true });
    state().setActiveEnvironment(null);
    expect(state().setEnvironmentVariable('accessToken', 'x', true)).toBe(false);
  });
});
