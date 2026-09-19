import { Button, Checkbox, Group, NumberInput, Select, SimpleGrid, Stack, Text, Textarea } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState } from 'react';
import { isHmacAlgorithm, jwtAuthProvider } from '@httpreq/api-client';
import { JWT_ALGORITHMS, type JwtAlgorithm, type JwtAuth } from '@httpreq/shared';
import type { AuthEditorProps } from './authServices';
import { Field } from './Field';

export function JwtEditor({ config, onChange }: AuthEditorProps<JwtAuth>) {
  const set = (patch: Partial<JwtAuth>) => onChange({ ...config, ...patch });
  const hmac = isHmacAlgorithm(config.algorithm);
  const [showKey, setShowKey] = useState(false);
  const issues = jwtAuthProvider.validate(config);
  const issue = (field: string) => issues.find((item) => item.field === field && item.severity === 'error')?.message;

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
        <Select
          label="Algorithm"
          value={config.algorithm}
          allowDeselect={false}
          data={JWT_ALGORITHMS.map((value) => ({ value, label: value }))}
          onChange={(algorithm) => algorithm && set({ algorithm: algorithm as JwtAlgorithm })}
          comboboxProps={{ withinPortal: true }}
        />
        <NumberInput
          label="Expires in (seconds)"
          description="0 omits the exp claim."
          min={0}
          value={config.expiresInSeconds}
          onChange={(value) => set({ expiresInSeconds: typeof value === 'number' ? value : 0 })}
        />
      </SimpleGrid>

      {hmac ? (
        <>
          <Field
            label="Secret"
            placeholder="{{jwtSecret}}"
            masked
            value={config.secret}
            onChange={(secret) => set({ secret })}
          />
          <Checkbox
            size="xs"
            label="Secret is Base64 encoded"
            checked={config.secretBase64}
            onChange={(event) => set({ secretBase64: event.currentTarget.checked })}
          />
        </>
      ) : (
        <Stack gap={4}>
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              Private key (PKCS#8 PEM)
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={showKey ? <IconEyeOff size={13} /> : <IconEye size={13} />}
              onClick={() => setShowKey((current) => !current)}
            >
              {showKey ? 'Hide' : config.secret ? 'Show' : 'Enter key'}
            </Button>
          </Group>
          {showKey ? (
            <Textarea
              aria-label="Private key"
              placeholder={'-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----'}
              value={config.secret}
              onChange={(event) => set({ secret: event.currentTarget.value })}
              autosize
              minRows={4}
              maxRows={10}
              className="hr-mono"
              spellCheck={false}
            />
          ) : (
            <Text size="xs" c="dimmed">
              {config.secret ? 'A private key is set (hidden).' : 'No private key yet.'} It is used only to
              sign each request and is not saved to disk as a literal value.
            </Text>
          )}
        </Stack>
      )}

      <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm">
        <Field label="Issuer (iss)" value={config.issuer} onChange={(issuer) => set({ issuer })} />
        <Field label="Subject (sub)" value={config.subject} onChange={(subject) => set({ subject })} />
        <Field label="Audience (aud)" value={config.audience} onChange={(audience) => set({ audience })} />
      </SimpleGrid>

      <Textarea
        label="Payload"
        description="Additional claims as a JSON object. iat is added automatically."
        value={config.payload}
        onChange={(event) => set({ payload: event.currentTarget.value })}
        error={issue('payload')}
        autosize
        minRows={3}
        maxRows={12}
        className="hr-mono"
        spellCheck={false}
      />
      <Textarea
        label="Extra header fields"
        description="Optional JSON object, e.g. {&quot;kid&quot;: &quot;key-1&quot;}. alg and typ are set automatically."
        value={config.header}
        onChange={(event) => set({ header: event.currentTarget.value })}
        error={issue('header')}
        autosize
        minRows={1}
        maxRows={6}
        className="hr-mono"
        spellCheck={false}
      />

      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
        <Select
          label="Add token to"
          value={config.addTo}
          allowDeselect={false}
          data={[
            { value: 'header', label: 'Authorization header' },
            { value: 'query', label: 'Query parameter' },
          ]}
          onChange={(addTo) => addTo && set({ addTo: addTo as JwtAuth['addTo'] })}
          comboboxProps={{ withinPortal: true }}
        />
        {config.addTo === 'header' ? (
          <Field
            label="Header prefix"
            mono={false}
            completion={false}
            value={config.headerPrefix}
            onChange={(headerPrefix) => set({ headerPrefix })}
          />
        ) : (
          <Field
            label="Query parameter name"
            value={config.queryParamKey}
            onChange={(queryParamKey) => set({ queryParamKey })}
          />
        )}
      </SimpleGrid>
    </Stack>
  );
}
