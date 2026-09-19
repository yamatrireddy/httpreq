import {
  createId,
  type Collection,
  type Folder,
  type HttpRequest,
  type TreeNodeKind,
  type Workspace,
} from '@httpreq/shared';

/**
 * Pure operations on the collection tree. Collections, folders and requests are stored in flat
 * arrays linked by `parentId`; array order is sibling order. Every function returns a new
 * workspace and leaves unrelated entities untouched (same object identity).
 */

export type ContainerNode =
  | { kind: 'collection'; node: Collection }
  | { kind: 'folder'; node: Folder };

export type TreeNode = ContainerNode | { kind: 'request'; node: HttpRequest };

export const findNode = (workspace: Workspace, id: string): TreeNode | undefined => {
  const collection = workspace.collections.find((item) => item.id === id);
  if (collection) return { kind: 'collection', node: collection };
  const folder = workspace.folders.find((item) => item.id === id);
  if (folder) return { kind: 'folder', node: folder };
  const request = workspace.requests.find((item) => item.id === id);
  return request ? { kind: 'request', node: request } : undefined;
};

const parentIdOf = (node: TreeNode): string | null =>
  node.kind === 'collection' ? null : node.node.parentId;

/** Containers from the root collection down to the direct parent of `id`. */
export const getAncestors = (workspace: Workspace, id: string): ContainerNode[] => {
  const start = findNode(workspace, id);
  const path: ContainerNode[] = [];
  let parentId = start ? parentIdOf(start) : null;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = findNode(workspace, parentId);
    if (!parent || parent.kind === 'request') break;
    path.unshift(parent);
    parentId = parentIdOf(parent);
  }
  return path;
};

export const isAncestorOf = (workspace: Workspace, ancestorId: string, id: string) =>
  getAncestors(workspace, id).some((item) => item.node.id === ancestorId);

export const childFolders = (workspace: Workspace, parentId: string) =>
  workspace.folders.filter((folder) => folder.parentId === parentId);

export const childRequests = (workspace: Workspace, parentId: string | null) =>
  workspace.requests.filter((request) => request.parentId === parentId);

/** Ids of `id` and everything beneath it, grouped by kind. */
export const collectSubtree = (workspace: Workspace, id: string) => {
  const containers = new Set<string>([id]);
  // Folders are appended in any order, so iterate until no new descendants are found.
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of workspace.folders) {
      if (containers.has(folder.parentId) && !containers.has(folder.id)) {
        containers.add(folder.id);
        grew = true;
      }
    }
  }
  const requests = workspace.requests
    .filter((request) => request.id === id || (request.parentId && containers.has(request.parentId)))
    .map((request) => request.id);
  return { containers, requests: new Set(requests) };
};

const touch = (workspace: Workspace, patch: Partial<Workspace>): Workspace => ({
  ...workspace,
  ...patch,
  updatedAt: new Date().toISOString(),
});

export const renameNode = (workspace: Workspace, id: string, name: string): Workspace => {
  const node = findNode(workspace, id);
  const trimmed = name.trim();
  if (!node || !trimmed || node.node.name === trimmed) return workspace;
  const rename = <T extends { id: string; name: string }>(items: T[]) =>
    items.map((item) => (item.id === id ? { ...item, name: trimmed } : item));
  if (node.kind === 'collection') return touch(workspace, { collections: rename(workspace.collections) });
  if (node.kind === 'folder') return touch(workspace, { folders: rename(workspace.folders) });
  return touch(workspace, { requests: rename(workspace.requests) });
};

/** Moves `item` within `items` so that it sits before `beforeId` (or last). */
const reorder = <T extends { id: string }>(items: T[], item: T, beforeId: string | null) => {
  const rest = items.filter((candidate) => candidate.id !== item.id);
  const index = beforeId ? rest.findIndex((candidate) => candidate.id === beforeId) : -1;
  rest.splice(index >= 0 ? index : rest.length, 0, item);
  return rest;
};

/**
 * Moves a folder or request into `parentId` (a collection or folder; `null` makes a request a
 * draft), before sibling `beforeId` when given. Collections are only reordered. Invalid moves,
 * such as a folder into its own subtree, return the workspace unchanged.
 */
export const moveNode = (
  workspace: Workspace,
  id: string,
  parentId: string | null,
  beforeId: string | null = null,
): Workspace => {
  const node = findNode(workspace, id);
  if (!node || beforeId === id) return workspace;
  if (node.kind === 'collection') {
    return touch(workspace, { collections: reorder(workspace.collections, node.node, beforeId) });
  }
  const target = parentId ? findNode(workspace, parentId) : undefined;
  if (parentId && (!target || target.kind === 'request')) return workspace;
  if (node.kind === 'folder') {
    if (!parentId || parentId === id || isAncestorOf(workspace, id, parentId)) return workspace;
    return touch(workspace, {
      folders: reorder(workspace.folders, { ...node.node, parentId }, beforeId),
    });
  }
  return touch(workspace, {
    requests: reorder(workspace.requests, { ...node.node, parentId }, beforeId),
  });
};

const copyName = (name: string) => `${name} (copy)`;

const cloneRequest = (request: HttpRequest, parentId: string | null): HttpRequest => {
  const copy = structuredClone(request);
  const rekey = <T extends { id: string }>(items: T[]) =>
    items.map((item) => ({ ...item, id: createId() }));
  return {
    ...copy,
    id: createId(),
    parentId,
    params: rekey(copy.params),
    headers: rekey(copy.headers),
    body: {
      ...copy.body,
      formUrlEncoded: rekey(copy.body.formUrlEncoded),
      multipart: rekey(copy.body.multipart),
    },
  };
};

/** Copies a node (and its subtree) next to the original. Returns the new workspace and root id. */
export const duplicateNode = (
  workspace: Workspace,
  id: string,
): { workspace: Workspace; id: string | null } => {
  const node = findNode(workspace, id);
  if (!node) return { workspace, id: null };
  if (node.kind === 'request') {
    const copy = { ...cloneRequest(node.node, node.node.parentId), name: copyName(node.node.name) };
    const requests = [...workspace.requests];
    requests.splice(requests.indexOf(node.node) + 1, 0, copy);
    return { workspace: touch(workspace, { requests }), id: copy.id };
  }

  const idMap = new Map<string, string>();
  const newId = (old: string) => {
    if (!idMap.has(old)) idMap.set(old, createId());
    return idMap.get(old)!;
  };
  const { containers, requests: requestIds } = collectSubtree(workspace, id);
  const folders = workspace.folders
    .filter((folder) => containers.has(folder.id) && folder.id !== id)
    .map((folder) => ({ ...structuredClone(folder), id: newId(folder.id), parentId: newId(folder.parentId) }));
  const requests = workspace.requests
    .filter((request) => requestIds.has(request.id))
    .map((request) => cloneRequest(request, newId(request.parentId!)));

  if (node.kind === 'collection') {
    const root = { ...structuredClone(node.node), id: newId(id), name: copyName(node.node.name) };
    const collections = [...workspace.collections];
    collections.splice(collections.indexOf(node.node) + 1, 0, root);
    return {
      workspace: touch(workspace, {
        collections,
        folders: [...workspace.folders, ...folders],
        requests: [...workspace.requests, ...requests],
      }),
      id: root.id,
    };
  }
  const root = { ...structuredClone(node.node), id: newId(id), name: copyName(node.node.name) };
  const allFolders = [...workspace.folders];
  allFolders.splice(allFolders.indexOf(node.node) + 1, 0, root, ...folders);
  return {
    workspace: touch(workspace, {
      folders: allFolders,
      requests: [...workspace.requests, ...requests],
    }),
    id: root.id,
  };
};

/** Deletes a node and its subtree. Returns the removed request ids so tabs and drafts can close. */
export const deleteNode = (
  workspace: Workspace,
  id: string,
): { workspace: Workspace; removedRequestIds: Set<string> } => {
  const node = findNode(workspace, id);
  if (!node) return { workspace, removedRequestIds: new Set() };
  const { containers, requests } = collectSubtree(workspace, id);
  return {
    workspace: touch(workspace, {
      collections: workspace.collections.filter((item) => !containers.has(item.id)),
      folders: workspace.folders.filter((item) => !containers.has(item.id)),
      requests: workspace.requests.filter((item) => !requests.has(item.id)),
      openRequestIds: workspace.openRequestIds.filter((openId) => !requests.has(openId)),
    }),
    removedRequestIds: requests,
  };
};

export const nodeKind = (workspace: Workspace, id: string): TreeNodeKind | undefined =>
  findNode(workspace, id)?.kind;
