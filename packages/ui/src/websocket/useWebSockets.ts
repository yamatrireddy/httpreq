import { createContext, useContext } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import {
  AppError,
  type WebSocketConnection,
  type WebSocketPayloadType,
  type WebSocketRequest,
  type WebSocketRuntime,
} from '@httpreq/shared';
import { buildWebSocket, hexToBytes, type PipelineContext } from '@httpreq/api-client';
import { byteLength, frameMessage, systemMessage, useConnectionsStore } from '../connections';

/**
 * Owns the app's WebSocket connections.
 *
 * Connections are keyed by the saved request's id, so a tab always shows its own socket and
 * closing a tab closes exactly one connection. Everything the UI needs — status, protocol and
 * message log — lives in the connections store; this hook only performs the side effects.
 */

export interface WebSocketApi {
  connect: (request: WebSocketRequest) => Promise<void>;
  disconnect: (requestId: string) => void;
  reconnect: (request: WebSocketRequest) => Promise<void>;
  send: (request: WebSocketRequest, payloadType: WebSocketPayloadType, data: string) => void;
  clear: (requestId: string) => void;
  /** Closes every socket and forgets it. Used when the workspace changes or the app unmounts. */
  closeAll: () => void;
  isConnected: (requestId: string) => boolean;
}

export const WebSocketContext = createContext<WebSocketApi | null>(null);

export const useWebSocketApi = (): WebSocketApi => {
  const api = useContext(WebSocketContext);
  if (!api) throw new Error('useWebSocketApi must be used inside the HttpReq application.');
  return api;
};

/** JSON and XML are sent as text; only `binary` is decoded from hex into bytes. */
const encodePayload = (payloadType: WebSocketPayloadType, data: string) =>
  payloadType === 'binary'
    ? ({ kind: 'binary', data: hexToBytes(data) } as const)
    : ({ kind: 'text', data } as const);

export function useWebSocketManager(
  runtime: WebSocketRuntime,
  context: () => PipelineContext,
): WebSocketApi {
  const connections = useRef(new Map<string, WebSocketConnection>());
  /** Pending automatic reconnects, so a manual disconnect can cancel one. */
  const reconnectTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const store = useConnectionsStore;

  const cancelReconnect = useCallback((requestId: string) => {
    const timer = reconnectTimers.current.get(requestId);
    if (timer) {
      clearTimeout(timer);
      reconnectTimers.current.delete(requestId);
    }
  }, []);

  const log = useCallback(
    (request: WebSocketRequest, message: ReturnType<typeof systemMessage>) =>
      store.getState().addSocketMessage(request.id, message, request.settings.messageLimit),
    [store],
  );

  const connect = useCallback(
    async (request: WebSocketRequest) => {
      const state = store.getState();
      cancelReconnect(request.id);
      if (connections.current.has(request.id)) return;

      state.setSocketStatus(request.id, 'connecting', { error: null });
      let built;
      try {
        built = await buildWebSocket(request, context(), runtime.supportsHeaders);
      } catch (error) {
        const message =
          error instanceof AppError ? error.message : 'The request could not be prepared.';
        store.getState().setSocketStatus(request.id, 'error', { error: message });
        log(request, systemMessage(message, true));
        return;
      }
      for (const warning of built.warnings) log(request, systemMessage(warning));

      try {
        const connection = await runtime.connect(built.prepared, (event) => {
          const current = store.getState();
          switch (event.type) {
            case 'open':
              current.setSocketStatus(request.id, 'connected', { protocol: event.protocol });
              log(
                request,
                systemMessage(
                  event.protocol
                    ? `Connected to ${built.prepared.url} (${event.protocol}).`
                    : `Connected to ${built.prepared.url}.`,
                ),
              );
              break;
            case 'message':
              current.addSocketMessage(
                request.id,
                frameMessage(
                  'received',
                  event.payloadType === 'binary' ? 'binary' : 'text',
                  event.data,
                  event.sizeBytes,
                ),
                request.settings.messageLimit,
              );
              break;
            case 'error':
              current.setSocketStatus(request.id, 'error', { error: event.message });
              log(request, systemMessage(event.message, true));
              break;
            case 'close': {
              connections.current.delete(request.id);
              log(
                request,
                systemMessage(
                  `Disconnected (code ${event.code}${event.reason ? `: ${event.reason}` : ''}).`,
                  !event.clean,
                ),
              );
              current.setSocketStatus(request.id, 'disconnected');
              // Only an unclean close is retried, and only when the request asked for it.
              if (request.settings.autoReconnect && !event.clean) {
                const attempts = (current.sockets[request.id]?.reconnectAttempts ?? 0) + 1;
                current.setSocketStatus(request.id, 'connecting', { reconnectAttempts: attempts });
                log(request, systemMessage(`Reconnecting (attempt ${attempts})…`));
                reconnectTimers.current.set(
                  request.id,
                  setTimeout(() => {
                    reconnectTimers.current.delete(request.id);
                    void connect(request);
                  }, request.settings.reconnectDelayMs),
                );
              }
              break;
            }
          }
        });
        connections.current.set(request.id, connection);
      } catch (error) {
        const message =
          error instanceof AppError ? error.message : 'The WebSocket connection failed.';
        store.getState().setSocketStatus(request.id, 'error', { error: message });
        log(request, systemMessage(message, true));
      }
    },
    [cancelReconnect, context, log, runtime, store],
  );

  const disconnect = useCallback(
    (requestId: string) => {
      cancelReconnect(requestId);
      const connection = connections.current.get(requestId);
      if (!connection) {
        store.getState().setSocketStatus(requestId, 'disconnected');
        return;
      }
      store.getState().setSocketStatus(requestId, 'disconnecting');
      connections.current.delete(requestId);
      try {
        connection.close(1000, 'Closed by the user');
      } catch {
        // Already gone; the close event has done the bookkeeping.
      }
      store.getState().setSocketStatus(requestId, 'disconnected');
    },
    [cancelReconnect, store],
  );

  const reconnect = useCallback(
    async (request: WebSocketRequest) => {
      disconnect(request.id);
      await connect(request);
    },
    [connect, disconnect],
  );

  const send = useCallback(
    (request: WebSocketRequest, payloadType: WebSocketPayloadType, data: string) => {
      const connection = connections.current.get(request.id);
      if (!connection) {
        notifications.show({ color: 'yellow', message: 'Connect before sending a message.' });
        return;
      }
      let payload;
      try {
        payload = encodePayload(payloadType, data);
      } catch (error) {
        const message =
          error instanceof AppError ? error.message : 'The message could not be encoded.';
        notifications.show({ color: 'red', title: 'Message not sent', message });
        return;
      }
      try {
        connection.send(payload);
      } catch (error) {
        const message =
          error instanceof AppError ? error.message : 'The message could not be sent.';
        log(request, systemMessage(message, true));
        notifications.show({ color: 'red', title: 'Message not sent', message });
        return;
      }
      store
        .getState()
        .addSocketMessage(
          request.id,
          frameMessage(
            'sent',
            payloadType,
            data,
            payload.kind === 'binary' ? payload.data.byteLength : byteLength(data),
          ),
          request.settings.messageLimit,
        );
    },
    [log, store],
  );

  const clear = useCallback(
    (requestId: string) => store.getState().clearSocketMessages(requestId),
    [store],
  );

  const closeAll = useCallback(() => {
    for (const timer of reconnectTimers.current.values()) clearTimeout(timer);
    reconnectTimers.current.clear();
    for (const connection of connections.current.values()) {
      try {
        connection.close(1001, 'HttpReq is closing the connection');
      } catch {
        // Nothing left to close.
      }
    }
    connections.current.clear();
  }, []);

  const isConnected = useCallback((requestId: string) => connections.current.has(requestId), []);

  // Sockets are owned by this hook, so unmounting the app must not leave one open.
  useEffect(() => closeAll, [closeAll]);

  return useMemo(
    () => ({ connect, disconnect, reconnect, send, clear, closeAll, isConnected }),
    [connect, disconnect, reconnect, send, clear, closeAll, isConnected],
  );
}
