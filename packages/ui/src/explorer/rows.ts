import type { HttpMethod, TreeNodeKind, Workspace } from '@httpreq/shared';
import { childFolders, childRequests } from '@httpreq/workspace';

export interface TreeRow {
  id: string;
  kind: TreeNodeKind;
  name: string;
  depth: number;
  parentId: string | null;
  method?: HttpMethod;
  url?: string;
  hasChildren: boolean;
  expanded: boolean;
}

/**
 * The visible rows of the explorer, depth-first (folders before requests). While filtering,
 * a node is shown when it or any descendant matches, and every shown container is expanded.
 */
export const buildRows = (
  workspace: Workspace,
  expanded: ReadonlySet<string>,
  filter: string,
): { collections: TreeRow[]; drafts: TreeRow[] } => {
  const query = filter.trim().toLowerCase();
  const matches = (text: string | undefined) => !!text && text.toLowerCase().includes(query);

  const memo = new Map<string, boolean>();
  const containerMatches = (id: string, name: string): boolean => {
    if (!query) return true;
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const result =
      matches(name) ||
      childFolders(workspace, id).some((folder) => containerMatches(folder.id, folder.name)) ||
      childRequests(workspace, id).some((request) => matches(request.name) || matches(request.url));
    memo.set(id, result);
    return result;
  };

  const rows: TreeRow[] = [];
  const visit = (id: string, depth: number, parentMatched: boolean) => {
    const folders = childFolders(workspace, id);
    const requests = childRequests(workspace, id);
    for (const folder of folders) {
      const selfMatch = parentMatched || matches(folder.name);
      if (query && !selfMatch && !containerMatches(folder.id, folder.name)) continue;
      const hasChildren = childFolders(workspace, folder.id).length + childRequests(workspace, folder.id).length > 0;
      const open = query ? true : expanded.has(folder.id);
      rows.push({ id: folder.id, kind: 'folder', name: folder.name, depth, parentId: id, hasChildren, expanded: open });
      if (open) visit(folder.id, depth + 1, selfMatch && !!query);
    }
    for (const request of requests) {
      if (query && !parentMatched && !matches(request.name) && !matches(request.url)) continue;
      rows.push({
        id: request.id,
        kind: 'request',
        name: request.name,
        depth,
        parentId: id,
        method: request.method,
        url: request.url,
        hasChildren: false,
        expanded: false,
      });
    }
  };

  for (const collection of workspace.collections) {
    const selfMatch = !!query && matches(collection.name);
    if (query && !containerMatches(collection.id, collection.name)) continue;
    const hasChildren =
      childFolders(workspace, collection.id).length + childRequests(workspace, collection.id).length > 0;
    const open = query ? true : expanded.has(collection.id);
    rows.push({
      id: collection.id,
      kind: 'collection',
      name: collection.name,
      depth: 0,
      parentId: null,
      hasChildren,
      expanded: open,
    });
    if (open) visit(collection.id, 1, selfMatch);
  }

  const drafts = childRequests(workspace, null)
    .filter((request) => !query || matches(request.name) || matches(request.url))
    .map<TreeRow>((request) => ({
      id: request.id,
      kind: 'request',
      name: request.name,
      depth: 0,
      parentId: null,
      method: request.method,
      url: request.url,
      hasChildren: false,
      expanded: false,
    }));

  return { collections: rows, drafts };
};
