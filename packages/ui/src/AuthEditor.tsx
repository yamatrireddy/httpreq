import { Group, PasswordInput, SegmentedControl, Select, Stack, TextInput } from '@mantine/core';
import type { AuthConfig } from '@httpreq/shared';

interface Props {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
}

export function AuthEditor({ auth, onChange }: Props) {
  return (
    <Stack gap="md" maw={680}>
      <SegmentedControl
        value={auth.type}
        onChange={(type) => {
          if (type === 'basic') onChange({ type, username: '', password: '' });
          else if (type === 'bearer') onChange({ type, token: '' });
          else if (type === 'api-key') onChange({ type, key: '', value: '', location: 'header' });
          else onChange({ type: 'none' });
        }}
        data={[
          { label: 'No auth', value: 'none' },
          { label: 'Basic', value: 'basic' },
          { label: 'Bearer', value: 'bearer' },
          { label: 'API key', value: 'api-key' },
        ]}
      />
      {auth.type === 'basic' && (
        <Group grow align="flex-start">
          <TextInput
            label="Username"
            value={auth.username}
            onChange={(event) => onChange({ ...auth, username: event.currentTarget.value })}
          />
          <PasswordInput
            label="Password"
            value={auth.password}
            onChange={(event) => onChange({ ...auth, password: event.currentTarget.value })}
          />
        </Group>
      )}
      {auth.type === 'bearer' && (
        <PasswordInput
          label="Token"
          value={auth.token}
          onChange={(event) => onChange({ ...auth, token: event.currentTarget.value })}
        />
      )}
      {auth.type === 'api-key' && (
        <Group grow align="flex-end">
          <TextInput
            label="Key"
            value={auth.key}
            onChange={(event) => onChange({ ...auth, key: event.currentTarget.value })}
          />
          <PasswordInput
            label="Value"
            value={auth.value}
            onChange={(event) => onChange({ ...auth, value: event.currentTarget.value })}
          />
          <Select
            label="Add to"
            value={auth.location}
            data={[
              { label: 'Header', value: 'header' },
              { label: 'Query parameter', value: 'query' },
            ]}
            onChange={(location) => onChange({ ...auth, location: location as 'header' | 'query' })}
          />
        </Group>
      )}
    </Stack>
  );
}
