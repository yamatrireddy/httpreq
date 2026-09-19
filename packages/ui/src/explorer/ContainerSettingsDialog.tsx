import { Button, Group, Modal, Stack, Textarea, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import { resolveInheritedAuth } from '@httpreq/api-client';
import { findNode } from '@httpreq/workspace';
import { AuthorizationPanel } from '../auth/AuthorizationPanel';
import { useWorkbenchStore } from '../store';

/**
 * Settings of a collection or folder. Its authorization is what requests (and sub-folders) set
 * to “Inherit from Parent” use. Changes apply immediately, like other structural edits.
 */
export function ContainerSettingsDialog({ nodeId, onClose }: { nodeId: string | null; onClose: () => void }) {
  const workspace = useWorkbenchStore((state) => state.workspace);
  const updateContainer = useWorkbenchStore((state) => state.updateContainer);
  const renameNode = useWorkbenchStore((state) => state.renameNode);
  const revealNode = useWorkbenchStore((state) => state.revealNode);
  const found = nodeId ? findNode(workspace, nodeId) : undefined;
  const node = found && found.kind !== 'request' ? found : undefined;
  const [name, setName] = useState('');

  useEffect(() => {
    if (node) setName(node.node.name);
    // Only reset the field when a different node is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  if (!node) return <Modal opened={false} onClose={onClose} />;
  const { kind } = node;
  const inherited = resolveInheritedAuth(workspace, kind === 'folder' ? node.node.parentId : null);

  return (
    <Modal opened onClose={onClose} title={kind === 'collection' ? 'Collection settings' : 'Folder settings'} size="lg">
      <Stack gap="md">
        <TextInput
          label="Name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          onBlur={() => renameNode(node.node.id, name)}
          onKeyDown={(event) => event.key === 'Enter' && renameNode(node.node.id, name)}
        />
        <Textarea
          label="Description"
          value={node.node.description}
          onChange={(event) => updateContainer(node.node.id, { description: event.currentTarget.value })}
          autosize
          minRows={2}
          maxRows={6}
        />
        <AuthorizationPanel
          auth={node.node.auth}
          onChange={(auth) => updateContainer(node.node.id, { auth })}
          inherited={inherited}
          canInherit={kind === 'folder'}
          owner={kind}
          onShowSource={(id) => {
            onClose();
            revealNode(id);
          }}
        />
        <Group justify="flex-end">
          <Button
            onClick={() => {
              renameNode(node.node.id, name);
              onClose();
            }}
          >
            Done
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
