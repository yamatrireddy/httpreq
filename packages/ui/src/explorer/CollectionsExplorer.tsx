import { ActionIcon, CloseButton, FileButton, Menu, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBolt,
  IconBox,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconDownload,
  IconFileImport,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconFold,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
} from '@tabler/icons-react';
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { collectSubtree, findNode, isLeafNode } from '@httpreq/workspace';
import { confirmAction } from '../confirm';
import { downloadJson, exportCollection, fileNameFor, importFile } from '../exchange';
import { isLeafRow, methodColor } from '../methods';
import { useWorkbenchStore } from '../store';
import { buildRows, type TreeRow } from './rows';
import classes from './Sidebar.module.css';

const DRAG_TYPE = 'application/x-httpreq-node';
const INDENT = 12;

interface Props {
  onOpenSettings: (id: string) => void;
  /** Called after a request is opened (e.g. to close the mobile drawer). */
  onOpened?: () => void;
}

const treeItemId = (id: string) => `explorer-${id}`;

export function CollectionsExplorer({ onOpenSettings, onOpened }: Props) {
  const workspace = useWorkbenchStore((state) => state.workspace);
  const drafts = useWorkbenchStore((state) => state.drafts);
  const expandedIds = useWorkbenchStore((state) => state.expandedIds);
  const selectedId = useWorkbenchStore((state) => state.selectedNodeId);
  const activeId = useWorkbenchStore((state) => state.activeRequestId);
  const renamingId = useWorkbenchStore((state) => state.renamingId);
  const revealNonce = useWorkbenchStore((state) => state.revealNonce);
  const actions = useWorkbenchStore.getState;

  const [filter, setFilter] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [drop, setDrop] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const dragged = useRef<string | null>(null);

  const { collections, drafts: draftRows } = useMemo(
    () => buildRows(workspace, expandedIds, filter),
    [workspace, expandedIds, filter],
  );
  const rows = useMemo(() => [...collections, ...draftRows], [collections, draftRows]);
  const rovingId = rows.some((row) => row.id === focusedId)
    ? focusedId
    : rows.some((row) => row.id === selectedId)
      ? selectedId
      : (rows[0]?.id ?? null);

  const focusRow = (id: string) => {
    setFocusedId(id);
    document.getElementById(treeItemId(id))?.focus();
  };

  // Breadcrumb navigation asks the explorer to reveal and focus a node.
  useEffect(() => {
    if (!revealNonce || !selectedId) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(treeItemId(selectedId));
      element?.scrollIntoView({ block: 'nearest' });
      element?.focus({ preventScroll: true });
      setFocusedId(selectedId);
    });
    return () => cancelAnimationFrame(frame);
  }, [revealNonce, selectedId]);

  const open = (row: TreeRow) => {
    if (isLeafRow(row.kind)) {
      actions().openRequest(row.id);
      onOpened?.();
    } else {
      actions().selectNode(row.id);
      actions().toggleExpanded(row.id);
    }
  };

  const remove = async (id: string) => {
    const node = findNode(workspace, id);
    if (!node) return;
    const subtree = collectSubtree(workspace, id);
    const requests = new Set([...subtree.requests, ...subtree.websockets]);
    const count = isLeafNode(node) ? 0 : requests.size;
    const unsaved = [...requests].filter((requestId) => drafts[requestId]).length;
    const result = await confirmAction({
      title: `Delete ${node.kind === 'websocket' ? 'WebSocket request' : node.kind}`,
      message:
        `Delete “${node.node.name}”` +
        (count ? ` and the ${count} request${count === 1 ? '' : 's'} inside it` : '') +
        '? This cannot be undone.' +
        (unsaved
          ? ` ${unsaved} open request${unsaved === 1 ? ' has' : 's have'} unsaved changes.`
          : ''),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (result === 'confirm') actions().deleteNode(id);
  };

  const exportNode = (id: string) => {
    const data = exportCollection(workspace, id);
    if (data) downloadJson(fileNameFor(data.collection.name, 'collection'), data);
  };

  const importFromFile = async (file: File | null) => {
    if (!file) return;
    try {
      const result = importFile(actions().workspace, await file.text());
      actions().applyImport(result.workspace, result.rootId, result.kind);
      notifications.show({ color: 'teal', message: `Imported “${file.name}”.` });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Import failed',
        message: (error as Error).message,
      });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    const index = rows.findIndex((row) => row.id === rovingId);
    const row = rows[index];
    if (!row) return;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    switch (event.key) {
      case 'ArrowDown':
        handled();
        if (rows[index + 1]) focusRow(rows[index + 1]!.id);
        break;
      case 'ArrowUp':
        handled();
        if (rows[index - 1]) focusRow(rows[index - 1]!.id);
        break;
      case 'Home':
        handled();
        focusRow(rows[0]!.id);
        break;
      case 'End':
        handled();
        focusRow(rows[rows.length - 1]!.id);
        break;
      case 'ArrowRight':
        handled();
        if (!isLeafRow(row.kind) && !row.expanded && row.hasChildren)
          actions().toggleExpanded(row.id, true);
        else if (row.expanded && rows[index + 1]) focusRow(rows[index + 1]!.id);
        break;
      case 'ArrowLeft':
        handled();
        if (!isLeafRow(row.kind) && row.expanded && !filter)
          actions().toggleExpanded(row.id, false);
        else if (row.parentId && rows.some((item) => item.id === row.parentId))
          focusRow(row.parentId);
        break;
      case 'Enter':
      case ' ':
        handled();
        open(row);
        break;
      case 'F2':
        handled();
        actions().setRenaming(row.id);
        break;
      case 'Delete':
        handled();
        void remove(row.id);
        break;
    }
  };

  /* Drag and drop: onto a container moves inside it; onto a request moves next to it. */
  const canDrop = (target: TreeRow | 'drafts') => {
    const source = dragged.current;
    if (!source) return false;
    const node = findNode(workspace, source);
    if (!node) return false;
    if (target === 'drafts') return isLeafNode(node);
    if (target.id === source) return false;
    if (node.kind === 'collection') return target.kind === 'collection';
    if (node.kind === 'folder') {
      const destination = isLeafRow(target.kind) ? target.parentId : target.id;
      return !!destination && !collectSubtree(workspace, source).containers.has(destination);
    }
    return true;
  };

  const onDrop = (target: TreeRow | 'drafts') => {
    const source = dragged.current;
    dragged.current = null;
    setDrop(null);
    if (!source || !canDrop(target)) return;
    const node = findNode(workspace, source)!;
    if (target === 'drafts') actions().moveNode(source, null);
    else if (node.kind === 'collection') actions().moveNode(source, null, target.id);
    else if (isLeafRow(target.kind)) actions().moveNode(source, target.parentId, target.id);
    else actions().moveNode(source, target.id);
  };

  const dragProps = (target: TreeRow | 'drafts', key: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!canDrop(target)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (drop !== key) setDrop(key);
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node))
        setDrop((current) => (current === key ? null : current));
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      onDrop(target);
    },
  });

  const renderRow = (row: TreeRow) => (
    <ExplorerRow
      key={row.id}
      row={row}
      selected={row.id === selectedId}
      active={row.id === activeId}
      tabbable={row.id === rovingId}
      unsaved={!!drafts[row.id]}
      renaming={row.id === renamingId}
      dropTarget={drop === row.id}
      menuOpen={menuFor === row.id}
      onMenuChange={(opened) => setMenuFor(opened ? row.id : null)}
      onFocusRow={setFocusedId}
      onOpen={open}
      onRename={(name) => actions().renameNode(row.id, name)}
      onCancelRename={() => actions().setRenaming(null)}
      onStartRename={() => actions().setRenaming(row.id)}
      onNewRequest={() => actions().createRequest(row.id)}
      onNewWebSocket={() => actions().createWebSocketRequest(row.id)}
      onNewFolder={() => actions().createFolder(row.id)}
      onDuplicate={() => actions().duplicateNode(row.id)}
      onDelete={() => void remove(row.id)}
      onSettings={() => onOpenSettings(row.id)}
      onExport={() => exportNode(row.id)}
      dragProps={{
        draggable: renamingId !== row.id,
        onDragStart: (event: DragEvent) => {
          dragged.current = row.id;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(DRAG_TYPE, row.id);
        },
        onDragEnd: () => {
          dragged.current = null;
          setDrop(null);
        },
        ...dragProps(row, row.id),
      }}
    />
  );

  return (
    <div className={classes.explorer}>
      <div className={classes.panelHeader}>
        <Text component="h2" className={classes.panelTitle}>
          Collections
        </Text>
        <Tooltip label="New collection">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="New collection"
            onClick={() => actions().createCollection()}
          >
            <IconPlus size={15} />
          </ActionIcon>
        </Tooltip>
        <Menu position="bottom-end" withinPortal shadow="md">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Collection actions">
              <IconDots size={15} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconBox size={14} />}
              onClick={() => actions().createCollection()}
            >
              New collection
            </Menu.Item>
            <Menu.Item
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                actions().createRequest(null);
                onOpened?.();
              }}
            >
              New draft request
            </Menu.Item>
            <FileButton
              onChange={(file) => void importFromFile(file)}
              accept="application/json,.json"
            >
              {(props) => (
                <Menu.Item {...props} leftSection={<IconFileImport size={14} />}>
                  Import…
                </Menu.Item>
              )}
            </FileButton>
            <Menu.Divider />
            <Menu.Item
              leftSection={<IconFold size={14} />}
              onClick={() => useWorkbenchStore.setState({ expandedIds: new Set() })}
            >
              Collapse all
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>

      <TextInput
        size="xs"
        mx={8}
        mb={6}
        aria-label="Filter collections"
        placeholder="Search requests…"
        leftSection={<IconSearch size={14} />}
        value={filter}
        onChange={(event) => setFilter(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setFilter('');
          if (event.key === 'ArrowDown' && rows[0]) {
            event.preventDefault();
            focusRow(rows[0].id);
          }
        }}
        rightSection={
          filter ? (
            <CloseButton size="xs" aria-label="Clear filter" onClick={() => setFilter('')} />
          ) : null
        }
      />

      <div role="tree" aria-label="Collections" className={classes.tree} onKeyDown={onKeyDown}>
        {collections.map(renderRow)}
        {workspace.collections.length === 0 && !filter && (
          <div className={classes.emptyTree}>
            <Text size="xs" c="dimmed">
              Collections group requests into folders that can share authorization.
            </Text>
            <ActionIcon.Group>
              <Tooltip label="New collection">
                <ActionIcon
                  variant="light"
                  aria-label="Create a collection"
                  onClick={() => actions().createCollection()}
                >
                  <IconPlus size={15} />
                </ActionIcon>
              </Tooltip>
            </ActionIcon.Group>
          </div>
        )}

        <div
          className={classes.sectionHeading}
          data-drop={drop === 'drafts' || undefined}
          {...dragProps('drafts', 'drafts')}
          role="presentation"
        >
          Drafts
        </div>
        {draftRows.map(renderRow)}
        {draftRows.length === 0 && (
          <Text size="xs" c="dimmed" px={12} py={4}>
            {filter ? 'No matching drafts.' : 'Requests not saved in a collection appear here.'}
          </Text>
        )}
        {filter && rows.length === 0 && (
          <Text size="xs" c="dimmed" px={12} py={8}>
            Nothing matches “{filter}”.
          </Text>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  row: TreeRow;
  selected: boolean;
  active: boolean;
  tabbable: boolean;
  unsaved: boolean;
  renaming: boolean;
  dropTarget: boolean;
  menuOpen: boolean;
  onMenuChange: (opened: boolean) => void;
  onFocusRow: (id: string) => void;
  onOpen: (row: TreeRow) => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onNewRequest: () => void;
  onNewWebSocket: () => void;
  onNewFolder: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSettings: () => void;
  onExport: () => void;
  dragProps: Record<string, unknown>;
}

const ExplorerRow = memo(function ExplorerRow({
  row,
  selected,
  active,
  tabbable,
  unsaved,
  renaming,
  dropTarget,
  menuOpen,
  onMenuChange,
  onFocusRow,
  onOpen,
  onRename,
  onCancelRename,
  onStartRename,
  onNewRequest,
  onNewWebSocket,
  onNewFolder,
  onDuplicate,
  onDelete,
  onSettings,
  onExport,
  dragProps,
}: RowProps) {
  const container = !isLeafRow(row.kind);
  const [name, setName] = useState(row.name);
  useEffect(() => {
    if (renaming) setName(row.name);
  }, [renaming, row.name]);

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    onMenuChange(true);
  };

  const Icon = row.kind === 'collection' ? IconBox : row.expanded ? IconFolderOpen : IconFolder;

  return (
    <div
      id={treeItemId(row.id)}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={container ? row.expanded : undefined}
      aria-current={active ? 'page' : undefined}
      tabIndex={tabbable ? 0 : -1}
      className={classes.row}
      data-selected={selected || undefined}
      data-drop={dropTarget || undefined}
      style={{ paddingLeft: 6 + row.depth * INDENT }}
      onClick={() => onOpen(row)}
      onFocus={(event) => event.target === event.currentTarget && onFocusRow(row.id)}
      onContextMenu={onContextMenu}
      onDoubleClick={(event) => {
        if (isLeafRow(row.kind)) {
          event.preventDefault();
          onStartRename();
        }
      }}
      title={row.url ? `${row.kind === 'websocket' ? 'WS' : row.method} ${row.url}` : row.name}
      {...dragProps}
    >
      <span className={classes.chevron} data-open={row.expanded || undefined} aria-hidden>
        {container && row.hasChildren && <IconChevronRight size={13} />}
      </span>
      {row.kind === 'request' ? (
        <span
          className={classes.method}
          style={{ color: `var(--mantine-color-${methodColor[row.method!]}-text)` }}
        >
          {row.method === 'DELETE' ? 'DEL' : row.method === 'OPTIONS' ? 'OPT' : row.method}
        </span>
      ) : row.kind === 'websocket' ? (
        <span className={classes.method} style={{ color: 'var(--mantine-color-violet-text)' }}>
          WS
        </span>
      ) : (
        <Icon size={15} className={classes.nodeIcon} aria-hidden />
      )}
      {renaming ? (
        <TextInput
          size="xs"
          className={classes.renameInput}
          aria-label={`Rename ${row.name}`}
          value={name}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setName(event.currentTarget.value)}
          onBlur={() => onRename(name)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') onRename(name);
            if (event.key === 'Escape') onCancelRename();
          }}
        />
      ) : (
        <span className={classes.rowName}>{row.name}</span>
      )}
      {unsaved && <span className={classes.unsavedDot} aria-label="unsaved changes" />}

      <span
        className={classes.rowActions}
        data-open={menuOpen || undefined}
        onClick={(event) => event.stopPropagation()}
      >
        {container && (
          <Tooltip label="New request">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              tabIndex={-1}
              aria-label={`New request in ${row.name}`}
              onClick={onNewRequest}
            >
              <IconPlus size={13} />
            </ActionIcon>
          </Tooltip>
        )}
        <Menu
          opened={menuOpen}
          onChange={onMenuChange}
          position="bottom-end"
          withinPortal
          shadow="md"
          width={210}
        >
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              tabIndex={-1}
              aria-label={`Actions for ${row.name}`}
            >
              <IconDots size={13} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {container && (
              <>
                <Menu.Item leftSection={<IconPlus size={14} />} onClick={onNewRequest}>
                  New request
                </Menu.Item>
                <Menu.Item leftSection={<IconBolt size={14} />} onClick={onNewWebSocket}>
                  New WebSocket request
                </Menu.Item>
                <Menu.Item leftSection={<IconFolderPlus size={14} />} onClick={onNewFolder}>
                  New folder
                </Menu.Item>
                <Menu.Item leftSection={<IconSettings size={14} />} onClick={onSettings}>
                  Settings & authorization…
                </Menu.Item>
                <Menu.Divider />
              </>
            )}
            <Menu.Item
              leftSection={<IconPencil size={14} />}
              rightSection={
                <Text size="xs" c="dimmed">
                  F2
                </Text>
              }
              onClick={onStartRename}
            >
              Rename
            </Menu.Item>
            <Menu.Item leftSection={<IconCopy size={14} />} onClick={onDuplicate}>
              Duplicate
            </Menu.Item>
            {row.kind === 'collection' && (
              <Menu.Item leftSection={<IconDownload size={14} />} onClick={onExport}>
                Export…
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onDelete}>
              Delete
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </span>
    </div>
  );
});
