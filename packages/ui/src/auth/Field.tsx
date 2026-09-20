import { Input } from '@mantine/core';
import { useId } from 'react';
import { VariableInput, type VariableInputProps } from '../editor/VariableInput';

interface Props extends Omit<VariableInputProps, 'id'> {
  label: string;
  description?: string;
  error?: string;
}

/** A labelled variable-aware input for authorization and settings forms. */
export function Field({ label, description, error, ...input }: Props) {
  const id = useId();
  return (
    <Input.Wrapper
      label={label}
      description={description}
      error={error}
      labelProps={{ htmlFor: id }}
    >
      <VariableInput id={id} invalid={!!error} {...input} />
    </Input.Wrapper>
  );
}
