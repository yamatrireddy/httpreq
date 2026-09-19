/// <reference types="@testing-library/jest-dom/vitest" />
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RequestTabs } from './RequestTabs';

const requests = ['One', 'Two', 'Three'].map((name, index) => ({
  id: `r${index}`,
  name,
  method: 'GET' as const,
  url: '',
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollTo ??= () => undefined;
});

const setup = (unsaved: string[] = []) => {
  const handlers = { onActivate: vi.fn(), onClose: vi.fn(), onNew: vi.fn(), onMove: vi.fn() };
  render(
    <MantineProvider>
      <RequestTabs requests={requests} activeId="r1" unsavedIds={new Set(unsaved)} {...handlers} />
    </MantineProvider>,
  );
  const tablist = screen.getByRole('tablist', { name: 'Open requests' });
  return { handlers, tablist, tabs: within(tablist).getAllByRole('tab') };
};

describe('RequestTabs', () => {
  it('exposes the tabs pattern with a single tab stop on the active tab', () => {
    const { tabs } = setup();
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect(tabs[1]!).toHaveAttribute('aria-controls', 'request-panel');
    expect(screen.getByRole('button', { name: 'Close Two' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scroll to previous tabs' })).toBeDisabled();
  });

  it('moves focus with arrows, Home and End without activating', () => {
    const { tabs, handlers } = setup();
    tabs[1]!.focus();
    fireEvent.keyDown(tabs[1]!, { key: 'ArrowRight' });
    expect(tabs[2]!).toHaveFocus();
    fireEvent.keyDown(tabs[2]!, { key: 'ArrowRight' });
    expect(tabs[0]!).toHaveFocus();
    fireEvent.keyDown(tabs[0]!, { key: 'End' });
    expect(tabs[2]!).toHaveFocus();
    fireEvent.keyDown(tabs[2]!, { key: 'Home' });
    expect(tabs[0]!).toHaveFocus();
    expect(handlers.onActivate).not.toHaveBeenCalled();
    fireEvent.click(tabs[0]!);
    expect(handlers.onActivate).toHaveBeenCalledWith('r0');
  });

  it('closes the focused tab with Delete and by middle click', () => {
    const { tabs, handlers } = setup();
    tabs[2]!.focus();
    fireEvent.keyDown(tabs[2]!, { key: 'Delete' });
    expect(handlers.onClose).toHaveBeenCalledWith('r2');
    fireEvent(tabs[0]!.parentElement!, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(handlers.onClose).toHaveBeenCalledWith('r0');
  });

  it('announces unsaved changes in the accessible name', () => {
    const { tabs } = setup(['r0']);
    expect(tabs[0]!).toHaveAccessibleName(/One \(unsaved changes\)/);
  });
});
