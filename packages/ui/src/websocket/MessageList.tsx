import {
  ActionIcon,
  Badge,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core';
import { IconPlugConnected, IconTrash } from '@tabler/icons-react';
import { memo, useEffect, useRef, useState } from 'react';
import type { WebSocketMessage, WebSocketStatus } from '@httpreq/shared';
import { formatSize } from '../format';
import { PaneHeader } from '../WorkbenchSplit';
import classes from './WebSocket.module.css';

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : `${date.toLocaleTimeString(undefined, { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
};

const ARROW: Record<WebSocketMessage['direction'], string> = {
  sent: '↑',
  received: '↓',
  system: '•',
};

const LABEL: Record<WebSocketMessage['direction'], string> = {
  sent: 'Sent',
  received: 'Received',
  system: 'Connection',
};

interface Props {
  messages: readonly WebSocketMessage[];
  /** Drives the empty state, which says why there is nothing to read yet. */
  status: WebSocketStatus;
  onClear: () => void;
}

/**
 * The connection's message history, oldest first. It follows new messages automatically, but
 * stops doing so as soon as the user scrolls up to read something, and resumes at the bottom.
 */
export const MessageList = memo(function MessageList({ messages, status, onClear }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    if (!follow) return;
    const element = viewport.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, follow]);

  const onScroll = () => {
    const element = viewport.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
    setFollow(atBottom);
  };

  const frames = messages.filter((message) => message.direction !== 'system').length;

  return (
    <div className={classes.messages}>
      <PaneHeader aria-label="Message log">
        <Group gap="xs">
          <Text size="xs" fw={600}>
            Messages
          </Text>
          <Badge size="xs" variant="light" color="gray">
            {frames}
          </Badge>
          {!follow && (
            <Text size="xs" c="dimmed">
              Paused — scroll to the bottom to follow
            </Text>
          )}
        </Group>
        <Tooltip label="Clear messages">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="Clear messages"
            disabled={messages.length === 0}
            onClick={onClear}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </PaneHeader>

      <div
        ref={viewport}
        className={classes.messageList}
        onScroll={onScroll}
        role="log"
        aria-label="WebSocket messages"
        aria-live="polite"
        tabIndex={0}
      >
        {messages.length === 0 ? (
          // The same shape as the HTTP response panel's empty state, so both kinds of request
          // read the same way before anything has arrived.
          <Center h="100%" className={classes.empty}>
            <Stack align="center" gap="xs">
              <ThemeIcon variant="light" size={44} radius="xl">
                {status === 'connecting' ? <Loader size="sm" /> : <IconPlugConnected size={22} />}
              </ThemeIcon>
              <Text fw={600}>
                {status === 'connecting'
                  ? 'Connecting…'
                  : status === 'connected'
                    ? 'Connected — no messages yet'
                    : 'Messages will appear here'}
              </Text>
              <Text size="sm" c="dimmed">
                {status === 'connected'
                  ? 'Send a message, or wait for the server to push one.'
                  : 'Enter a URL and select Connect.'}
              </Text>
            </Stack>
          </Center>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={classes.message}
              data-direction={message.direction}
              data-error={message.error ? 'true' : undefined}
            >
              <span className={classes.arrow} aria-hidden>
                {ARROW[message.direction]}
              </span>
              <pre className={classes.payload}>
                <VisuallyHidden>{LABEL[message.direction]}: </VisuallyHidden>
                {message.data}
              </pre>
              <span className={classes.meta}>
                <span>{formatTime(message.timestamp)}</span>
                {message.direction !== 'system' && (
                  <span>
                    {message.payloadType.toUpperCase()} · {formatSize(message.sizeBytes)}
                  </span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
