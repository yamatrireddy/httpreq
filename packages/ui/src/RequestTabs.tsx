import { ActionIcon, Menu, Tooltip, VisuallyHidden } from '@mantine/core';
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconX,
} from '@tabler/icons-react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { HttpMethod, HttpRequest } from '@httpreq/shared';
import { methodColor, REQUEST_PANEL_ID, requestTabId } from './methods';
import classes from './RequestTabs.module.css';

type TabRequest = Pick<HttpRequest, 'id' | 'name' | 'method' | 'url'>;

interface Props {
  requests: TabRequest[];
  activeId: string;
  unsavedIds: ReadonlySet<string>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onMove: (id: string, toIndex: number) => void;
  newShortcut?: string;
  closeShortcut?: string;
  /** Extra controls rendered at the right end of the strip. */
  actions?: ReactNode;
}

const DRAG_TYPE = 'application/x-httpreq-tab';
const EDGE_PADDING = 24;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth');

/**
 * Scrollable request tab strip (WAI-ARIA tabs pattern with manual activation). Arrow keys,
 * Home and End move focus with a roving tabindex; Enter or Space activates; Delete closes.
 * Tabs never wrap: the strip scrolls horizontally with previous/next controls, the mouse wheel,
 * trackpads, and automatically keeps the selected or focused tab in view.
 */
export const RequestTabs = memo(function RequestTabs({
  requests,
  activeId,
  unsavedIds,
  onActivate,
  onClose,
  onNew,
  onMove,
  newShortcut,
  closeShortcut,
  actions,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ previous: false, next: false });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; side: 'before' | 'after' } | null>(null);
  const draggedId = useRef<string | null>(null);
  const focusAfterRender = useRef(false);
  const closable = requests.length > 1;
  const rovingId = requests.some((request) => request.id === focusedId) ? focusedId! : activeId;

  const tabElement = (id: string) =>
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`) ?? null;

  const updateEdges = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const previous = viewport.scrollLeft > 1;
    const next = viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1;
    setEdges((current) =>
      current.previous === previous && current.next === next ? current : { previous, next },
    );
  }, []);

  const revealTab = useCallback((id: string, behavior: ScrollBehavior = scrollBehavior()) => {
    const viewport = viewportRef.current;
    const wrapper = listRef.current?.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(id)}"]`,
    )?.parentElement;
    if (!viewport || !wrapper) return;
    const left = wrapper.offsetLeft;
    const right = left + wrapper.offsetWidth;
    if (left < viewport.scrollLeft) {
      viewport.scrollTo({ left: Math.max(0, left - EDGE_PADDING), behavior });
    } else if (right > viewport.scrollLeft + viewport.clientWidth) {
      viewport.scrollTo({ left: right - viewport.clientWidth + EDGE_PADDING, behavior });
    }
  }, []);

  // Keep the selected tab visible whenever it changes or tabs are added, closed or reordered.
  useLayoutEffect(() => {
    revealTab(activeId);
  }, [activeId, requests, revealTab]);

  useEffect(() => {
    if (!focusAfterRender.current) return;
    focusAfterRender.current = false;
    tabElement(activeId)?.focus();
  });

  // Track overflow on scroll and whenever the viewport or the tab list changes size.
  useEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;
    let frame = 0;
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          updateEdges();
        });
      }
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    observer.observe(list);
    viewport.addEventListener('scroll', schedule, { passive: true });
    updateEdges();

    // Vertical mouse wheels scroll the strip horizontally; trackpads already send deltaX.
    const onWheel = (event: WheelEvent) => {
      if (viewport.scrollWidth <= viewport.clientWidth) return;
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      viewport.scrollLeft += event.deltaY * unit;
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport.removeEventListener('scroll', schedule);
      viewport.removeEventListener('wheel', onWheel);
    };
  }, [updateEdges]);

  /** Scrolls roughly one page, aligned to a tab boundary. */
  const scrollPage = (direction: 1 | -1) => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;
    const max = viewport.scrollWidth - viewport.clientWidth;
    const target = Math.min(
      max,
      Math.max(0, viewport.scrollLeft + direction * viewport.clientWidth * 0.8),
    );
    const containing = [...list.children].find((child) => {
      const element = child as HTMLElement;
      return element.offsetLeft <= target && target < element.offsetLeft + element.offsetWidth;
    }) as HTMLElement | undefined;
    let left = containing ? containing.offsetLeft : target;
    if (direction > 0 && left <= viewport.scrollLeft) left = target;
    viewport.scrollTo({ left, behavior: scrollBehavior() });
  };

  const focusTab = (id: string) => {
    setFocusedId(id);
    tabElement(id)?.focus();
    revealTab(id);
  };

  const close = (id: string) => {
    if (!closable) return;
    const wasFocused = tabElement(id) === document.activeElement;
    onClose(id);
    if (wasFocused) {
      setFocusedId(null);
      focusAfterRender.current = true;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const focused = (event.target as HTMLElement).closest<HTMLElement>('[data-tab-id]');
    const currentId = focused?.dataset.tabId ?? rovingId;
    const index = requests.findIndex((request) => request.id === currentId);
    let target: number | undefined;
    if (event.key === 'ArrowRight') target = (index + 1) % requests.length;
    else if (event.key === 'ArrowLeft') target = (index - 1 + requests.length) % requests.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = requests.length - 1;
    else if (event.key === 'Delete') {
      event.preventDefault();
      close(currentId);
      return;
    }
    if (target === undefined) return;
    event.preventDefault();
    focusTab(requests[target]!.id);
  };

  const onDragStart = (event: DragEvent<HTMLElement>, id: string) => {
    draggedId.current = id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, id);
  };

  const onDragOver = (event: DragEvent<HTMLElement>, id: string) => {
    if (!draggedId.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const side = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    setDrop((current) => (current?.id === id && current.side === side ? current : { id, side }));
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const dragged = draggedId.current;
    if (dragged && drop) {
      const from = requests.findIndex((request) => request.id === dragged);
      const over = requests.findIndex((request) => request.id === drop.id);
      let to = drop.side === 'before' ? over : over + 1;
      if (from < to) to -= 1;
      if (from >= 0 && over >= 0) onMove(dragged, to);
    }
    endDrag();
  };

  const endDrag = () => {
    draggedId.current = null;
    setDrop(null);
  };

  return (
    <div className={classes.bar}>
      <ActionIcon
        className={classes.scrollButton}
        variant="subtle"
        color="gray"
        radius={0}
        aria-label="Scroll to previous tabs"
        title="Scroll to previous tabs"
        disabled={!edges.previous}
        onClick={() => scrollPage(-1)}
      >
        <IconChevronLeft size={15} />
      </ActionIcon>

      <div ref={viewportRef} className={classes.viewport}>
        <div
          ref={listRef}
          role="tablist"
          aria-label="Open requests"
          aria-orientation="horizontal"
          className={classes.list}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocusedId(null);
          }}
        >
          {requests.map((request) => (
            <RequestTab
              key={request.id}
              request={request}
              active={request.id === activeId}
              unsaved={unsavedIds.has(request.id)}
              tabbable={request.id === rovingId}
              closable={closable}
              closeShortcut={closeShortcut}
              dropSide={drop?.id === request.id ? drop.side : undefined}
              onActivate={onActivate}
              onFocus={setFocusedId}
              onClose={close}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={endDrag}
            />
          ))}
        </div>
      </div>

      <ActionIcon
        className={classes.scrollButton}
        variant="subtle"
        color="gray"
        radius={0}
        aria-label="Scroll to next tabs"
        title="Scroll to next tabs"
        disabled={!edges.next}
        onClick={() => scrollPage(1)}
      >
        <IconChevronRight size={15} />
      </ActionIcon>

      <Tooltip label={newShortcut ? `New request (${newShortcut})` : 'New request'}>
        <ActionIcon
          className={classes.barButton}
          variant="subtle"
          color="gray"
          radius={0}
          aria-label="New request"
          aria-keyshortcuts={newShortcut}
          onClick={onNew}
        >
          <IconPlus size={16} />
        </ActionIcon>
      </Tooltip>

      <Menu position="bottom-end" shadow="md" width={280} withinPortal>
        <Menu.Target>
          <ActionIcon
            className={classes.barButton}
            variant="subtle"
            color="gray"
            radius={0}
            aria-label="Show all open requests"
            title="Show all open requests"
          >
            <IconChevronDown size={15} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown className={classes.allTabsMenu}>
          <Menu.Label>Open requests ({requests.length})</Menu.Label>
          {requests.map((request) => (
            <Menu.Item
              key={request.id}
              onClick={() => onActivate(request.id)}
              leftSection={<MethodLabel method={request.method} />}
              rightSection={request.id === activeId ? <span aria-hidden>●</span> : undefined}
              aria-current={request.id === activeId ? 'true' : undefined}
            >
              <span className={classes.menuName}>{request.name}</span>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>

      <div className={classes.spacer} />
      {actions}
    </div>
  );
});

function MethodLabel({ method }: { method: HttpMethod }) {
  return (
    <span
      className={classes.method}
      style={{ color: `var(--mantine-color-${methodColor[method]}-text)` }}
    >
      {method}
    </span>
  );
}

interface TabProps {
  request: TabRequest;
  active: boolean;
  unsaved: boolean;
  tabbable: boolean;
  closable: boolean;
  closeShortcut?: string;
  dropSide?: 'before' | 'after';
  onActivate: (id: string) => void;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onDragStart: (event: DragEvent<HTMLElement>, id: string) => void;
  onDragOver: (event: DragEvent<HTMLElement>, id: string) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

const RequestTab = memo(function RequestTab({
  request,
  active,
  unsaved,
  tabbable,
  closable,
  closeShortcut,
  dropSide,
  onActivate,
  onFocus,
  onClose,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TabProps) {
  return (
    <div
      role="presentation"
      className={classes.tabWrapper}
      data-active={active || undefined}
      data-unsaved={unsaved || undefined}
      data-drop={dropSide}
      draggable
      onDragStart={(event) => onDragStart(event, request.id)}
      onDragOver={(event) => onDragOver(event, request.id)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseDown={(event) => {
        // Middle-click closes, as in browsers and editors; suppress the autoscroll cursor.
        if (event.button === 1) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button === 1 && closable) onClose(request.id);
      }}
    >
      <button
        type="button"
        role="tab"
        id={requestTabId(request.id)}
        data-tab-id={request.id}
        className={classes.tab}
        aria-selected={active}
        aria-controls={REQUEST_PANEL_ID}
        aria-keyshortcuts={closable ? 'Delete' : undefined}
        tabIndex={tabbable ? 0 : -1}
        title={request.url ? `${request.name}\n${request.method} ${request.url}` : request.name}
        onClick={() => onActivate(request.id)}
        onFocus={() => onFocus(request.id)}
      >
        <MethodLabel method={request.method} />
        <span className={classes.name}>{request.name}</span>
        {unsaved && <VisuallyHidden>(unsaved changes)</VisuallyHidden>}
      </button>
      <span className={classes.trailing}>
        {unsaved && <span className={classes.unsavedDot} aria-hidden />}
        {closable && (
          <button
            type="button"
            className={classes.close}
            tabIndex={-1}
            aria-label={`Close ${request.name}`}
            title={closeShortcut ? `Close (${closeShortcut})` : 'Close'}
            onClick={() => onClose(request.id)}
          >
            <IconX size={13} aria-hidden />
          </button>
        )}
      </span>
    </div>
  );
});
