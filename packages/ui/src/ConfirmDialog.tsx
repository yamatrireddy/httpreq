import { Button, Group, Modal, Text } from '@mantine/core';
import { settleConfirm, useConfirmStore } from './confirm';

/** Renders the pending `confirmAction` request, if any. */
export function ConfirmDialog() {
  const request = useConfirmStore((state) => state.request);
  return (
    <Modal
      opened={!!request}
      onClose={() => settleConfirm('cancel')}
      title={request?.title}
      size="sm"
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
