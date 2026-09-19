import {
  useCallback,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { clampRatio, type ResponsePosition } from './preferences';
import classes from './SplitPane.module.css';

interface Props {
  layout: ResponsePosition;
  ratio: number;
  defaultRatio: number;
  /** Called once per completed drag or keyboard step, never on every pointer move. */
  onRatioChange: (ratio: number) => void;
  first: ReactNode;
  second: ReactNode;
  firstId: string;
  label: string;
}

const KEYBOARD_STEP = 0.02;
const KEYBOARD_LARGE_STEP = 0.1;

/**
 * Two panes separated by a draggable splitter (WAI-ARIA window splitter pattern). Switching the
 * layout only changes CSS, so pane contents such as code editors are never remounted. While
 * dragging, the ratio is written straight to a CSS variable; React state (and persistence) is
 * updated once when the drag ends.
 */
export function SplitPane({
  layout,
  ratio,
  defaultRatio,
  onRatioChange,
  first,
  second,
  firstId,
  label,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const splitterRef = useRef<HTMLDivElement>(null);
  const liveRatio = useRef(ratio);
  const drag = useRef<{ rect: DOMRect; frame: number; pending: number } | null>(null);
  const horizontal = layout === 'right';

  const apply = useCallback((value: number) => {
    liveRatio.current = value;
    containerRef.current?.style.setProperty('--split-ratio', String(value));
    splitterRef.current?.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  }, []);

  useLayoutEffect(() => apply(ratio), [apply, ratio]);

  /** Effective ratio after the panes' CSS minimum sizes are applied. */
  const measuredRatio = () => {
    const container = containerRef.current;
    const firstPane = container?.firstElementChild as HTMLElement | null;
    if (!container || !firstPane) return liveRatio.current;
    const total = horizontal ? container.clientWidth : container.clientHeight;
    const size = horizontal ? firstPane.offsetWidth : firstPane.offsetHeight;
    return total > 0 ? size / total : liveRatio.current;
  };

  const commit = (value: number) => {
    const next = clampRatio(value);
    apply(next);
    onRatioChange(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !containerRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    drag.current = {
      rect: containerRef.current.getBoundingClientRect(),
      frame: 0,
      pending: liveRatio.current,
    };
    containerRef.current.dataset.dragging = 'true';
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const { rect } = state;
    state.pending = clampRatio(
      horizontal
        ? (event.clientX - rect.left) / rect.width
        : (event.clientY - rect.top) / rect.height,
    );
    if (!state.frame) {
      state.frame = requestAnimationFrame(() => {
        state.frame = 0;
        apply(state.pending);
      });
    }
  };

  const endDrag = () => {
    const state = drag.current;
    if (!state) return;
    cancelAnimationFrame(state.frame);
    drag.current = null;
    delete containerRef.current?.dataset.dragging;
    apply(state.pending);
    // Persist what the user actually sees, so a clamped pane does not "jump" on restore.
    commit(measuredRatio());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
    const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
    let next: number | undefined;
    if (event.key === decrease) next = measuredRatio() - step;
    else if (event.key === increase) next = measuredRatio() + step;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else if (event.key === 'Enter') next = defaultRatio;
    if (next === undefined) return;
    event.preventDefault();
    commit(next);
  };

  return (
    <div
      ref={containerRef}
      className={classes.container}
      data-layout={layout}
      style={{ '--split-ratio': ratio } as CSSProperties}
    >
      <div className={classes.first}>{first}</div>
      <div
        ref={splitterRef}
        role="separator"
        tabIndex={0}
        className={classes.splitter}
        aria-label={label}
        aria-controls={firstId}
        // A vertical bar splits side-by-side panes; a horizontal bar splits stacked panes.
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-valuemin={10}
        aria-valuemax={90}
        aria-valuenow={Math.round(ratio * 100)}
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDoubleClick={() => commit(defaultRatio)}
        onKeyDown={onKeyDown}
      />
      <div className={classes.second}>{second}</div>
    </div>
  );
}
