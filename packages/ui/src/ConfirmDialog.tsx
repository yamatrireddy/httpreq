import { Button, Group, Modal, Text } from '@mantine/core';
import { settleConfirm, useConfirmStore } from './confirm';
import { Z_LAYERS } from './zLayers';

/**
 * Renders the pending `confirmAction` request, if any.
 *
 * A confirmation is often raised from inside another dialog, so it takes its own layer rather
 * than relying on which portal happens to be later in the DOM.
 */
export function ConfirmDialog() {
  const request = useConfirmStore((state) => state.request);
  return (
    <Modal
      opened={!!request}
      onClose={() => settleConfirm('cancel')}
      title={request?.title}
      size="sm"
      zIndex={Z_LAYERS.confirm}
      centered
    >
      {request && (
        <>
          <Text size="sm">{request.message}</Text>
          <Group justify="flex-end" mt="lg" gap="xs">
            <Button variant="default" onClick={() => settleConfirm('cancel')}>
              Cancel
            </Button>
            {request.alternateLabel && (
              <Button variant="default" color="red" onClick={() => settleConfirm('alternate')}>
                {request.alternateLabel}
              </Button>
            )}
            <Button
              color={request.danger ? 'red' : undefined}
              onClick={() => settleConfirm('confirm')}
              data-autofocus
            >
              {request.confirmLabel}
            </Button>
          </Group>
        </>
      )}
    </Modal>
  );
}
