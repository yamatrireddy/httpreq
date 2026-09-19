import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyValueEditor } from './KeyValueEditor';

describe('KeyValueEditor', () => {
  it('adds an enabled editable row', () => {
    const onChange = vi.fn();
    render(
      <MantineProvider>
        <KeyValueEditor items={[]} onChange={onChange} />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /add row/i }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ key: '', value: '', enabled: true }),
    ]);
  });
});
