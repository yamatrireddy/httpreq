import { ActionIcon, Badge, Group, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { memo, useEffect, useRef, useState } from 'react';
import type { WebSocketMessage } from '@httpreq/shared';
import { formatSize } from '../format';
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
  onClear: () => void;
}

/**
 * The connection's message history, oldest first. It follows new messages automatically, but
 * stops doing so as soon as the user scrolls up to read something, and resumes at the bottom.
 */
export const MessageList = memo(function MessageList({ messages, onClear }: Props) {
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
      <div className={classes.messageHeader}>
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
      </div>

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
          <Text className={classes.empty} size="sm" c="dimmed">
            No messages yet. Connect, then send one.
          </Text>
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
