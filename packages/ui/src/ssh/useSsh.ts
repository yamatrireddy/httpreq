import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { notifications } from '@mantine/notifications';
import { createVariableResolver } from '@httpreq/api-client';
import {
  createId,
  sshErrorOf,
  type HostKeyDecision,
  type HostKeyPrompt,
  type SshBridge,
  type SshErrorInfo,
  type SshProfile,
  type TerminalSize,
} from '@httpreq/shared';
import { useConnectionsStore } from '../connections';
import { activeEnvironment, useWorkbenchStore } from '../store';

/**
 * The renderer's view of SSH.
 *
 * Nothing here holds a credential: a password or passphrase is handed to the bridge once, on save,
 * and from then on the main process looks it up in the OS vault by the profile's `credentialId`.
 * Host and username may contain `{{variables}}`, which are resolved here, against the active
 * environment, before the profile crosses IPC.
 */

export interface PendingHostKey {
  promptId: string;
  prompt: HostKeyPrompt;
}

export interface SshApi {
  /** Null in the browser, and in a desktop build whose SSH bridge failed to load. */
  readonly available: boolean;
  /** Opens a terminal tab and connects it. Returns the session id, or null when unavailable. */
  open: (profile: SshProfile) => Promise<string | null>;
  disconnect: (sessionId: string) => Promise<void>;
  /** Closes the session and its tab. */
  close: (sessionId: string) => Promise<void>;
  reconnect: (sessionId: string) => Promise<void>;
  write: (sessionId: string, data: string) => void;
  resize: (sessionId: string, size: TerminalSize) => void;
  test: (profile: SshProfile) => Promise<SshErrorInfo | null>;
  pickPrivateKey: () => Promise<string | null>;
  setCredential: (credentialId: string, secret: string) => Promise<boolean>;
  hasCredential: (credentialId: string) => Promise<boolean>;
  deleteCredential: (credentialId: string) => Promise<void>;
  /** Subscribes to terminal output for one session. Returns an unsubscribe function. */
  onData: (sessionId: string, listener: (data: string) => void) => () => void;
  /** The host-key question currently awaiting an answer, if any. */
  pendingHostKey: PendingHostKey | null;
  answerHostKey: (decision: HostKeyDecision) => void;
  closeAll: () => Promise<void>;
}

export const SshContext = createContext<SshApi | null>(null);

export const useSsh = (): SshApi => {
  const api = useContext(SshContext);
  if (!api) throw new Error('useSsh must be used inside the HttpReq application.');
  return api;
};

/** Substitutes `{{variables}}` in the fields a connection actually uses. */
export const resolveSshProfile = (profile: SshProfile): SshProfile => {
  const resolver = createVariableResolver(
    activeEnvironment(useWorkbenchStore.getState().workspace),
  );
  return {
    ...profile,
    host: resolver.resolve(profile.host).trim(),
    username: resolver.resolve(profile.username).trim(),
  };
};

const UNAVAILABLE: SshApi = {
  available: false,
  open: async () => null,
  disconnect: async () => undefined,
  close: async () => undefined,
  reconnect: async () => undefined,
  write: () => undefined,
  resize: () => undefined,
  test: async () => sshErrorOf('SSH_UNAVAILABLE'),
  pickPrivateKey: async () => null,
  setCredential: async () => false,
  hasCredential: async () => false,
  deleteCredential: async () => undefined,
  onData: () => () => undefined,
  pendingHostKey: null,
  answerHostKey: () => undefined,
  closeAll: async () => undefined,
};

export function useSshManager(bridge: SshBridge | undefined): SshApi {
  const [pendingHostKey, setPendingHostKey] = useState<PendingHostKey | null>(null);
  /** Terminal output listeners, one per mounted terminal. */
  const dataListeners = useRef(new Map<string, Set<(data: string) => void>>());
  /** The profile each session was opened with, so "Reconnect" needs no lookup. */
  const sessionProfiles = useRef(new Map<string, SshProfile>());

  useEffect(() => {
    if (!bridge) return;
    const offEvent = bridge.onSessionEvent((sessionId, event) => {
      const connections = useConnectionsStore.getState();
      switch (event.type) {
        case 'status':
          connections.patchSession(sessionId, {
            status: event.status,
            ...(event.status === 'connected'
              ? { error: null, startedAt: new Date().toISOString() }
              : {}),
          });
          break;
        case 'data':
          for (const listener of dataListeners.current.get(sessionId) ?? []) listener(event.data);
          break;
        case 'error':
          connections.patchSession(sessionId, { status: 'error', error: event.error });
          break;
        case 'closed':
          connections.patchSession(sessionId, { status: 'disconnected' });
          break;
      }
    });
    const offPrompt = bridge.onHostKeyPrompt((promptId, prompt) =>
      setPendingHostKey({ promptId, prompt }),
    );
    return () => {
      offEvent();
      offPrompt();
    };
  }, [bridge]);

  const answerHostKey = useCallback(
    (decision: HostKeyDecision) => {
      setPendingHostKey((current) => {
        if (current && bridge) bridge.resolveHostKey(current.promptId, decision);
        return null;
      });
    },
    [bridge],
  );

  const open = useCallback(
    async (profile: SshProfile) => {
      if (!bridge) return null;
      const sessionId = createId();
      const store = useWorkbenchStore.getState();
      useConnectionsStore.getState().setSession({
        sessionId,
        profileId: profile.id,
        name: profile.name,
        status: 'connecting',
        error: null,
        startedAt: null,
      });
      store.openSshSession(sessionId);
      sessionProfiles.current.set(sessionId, profile);

      // A sensible starting size; the terminal sends its real one as soon as it has laid out.
      const result = await bridge.connect({
        sessionId,
        profile: resolveSshProfile(profile),
        size: { cols: 80, rows: 24, width: 640, height: 384 },
      });
      if (!result.ok) {
        useConnectionsStore
          .getState()
          .patchSession(sessionId, { status: 'error', error: result.error });
      }
      return sessionId;
    },
    [bridge],
  );

  const disconnect = useCallback(
    async (sessionId: string) => {
      await bridge?.disconnect(sessionId);
      useConnectionsStore.getState().patchSession(sessionId, { status: 'disconnected' });
    },
    [bridge],
  );

  const close = useCallback(
    async (sessionId: string) => {
      await disconnect(sessionId);
      sessionProfiles.current.delete(sessionId);
      useConnectionsStore.getState().forgetSession(sessionId);
      useWorkbenchStore.getState().closeSshSession(sessionId);
    },
    [disconnect],
  );

  const reconnect = useCallback(
    async (sessionId: string) => {
      const profile = sessionProfiles.current.get(sessionId);
      if (!bridge || !profile) return;
      await bridge.disconnect(sessionId);
      useConnectionsStore.getState().patchSession(sessionId, { status: 'connecting', error: null });
      const result = await bridge.connect({
        sessionId,
        profile: resolveSshProfile(profile),
        size: { cols: 80, rows: 24, width: 640, height: 384 },
      });
      if (!result.ok) {
        useConnectionsStore
          .getState()
          .patchSession(sessionId, { status: 'error', error: result.error });
      }
    },
    [bridge],
  );

  const test = useCallback(
    async (profile: SshProfile): Promise<SshErrorInfo | null> => {
      if (!bridge) return sshErrorOf('SSH_UNAVAILABLE');
      const result = await bridge.testConnection(resolveSshProfile(profile));
      if (result.ok) {
        notifications.show({
          color: 'teal',
          title: 'Connection succeeded',
          message: result.value.banner.trim() || `Authenticated as ${profile.username}.`,
        });
        return null;
      }
      return result.error;
    },
    [bridge],
  );

  const onData = useCallback((sessionId: string, listener: (data: string) => void) => {
    const listeners = dataListeners.current.get(sessionId) ?? new Set();
    listeners.add(listener);
    dataListeners.current.set(sessionId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) dataListeners.current.delete(sessionId);
    };
  }, []);

  const closeAll = useCallback(async () => {
    if (!bridge) return;
    const ids = [...sessionProfiles.current.keys()];
    sessionProfiles.current.clear();
    await Promise.all(ids.map((id) => bridge.disconnect(id).catch(() => undefined)));
  }, [bridge]);

  return useMemo<SshApi>(() => {
    if (!bridge) return UNAVAILABLE;
    return {
      available: true,
      open,
      disconnect,
      close,
      reconnect,
      write: (sessionId, data) => bridge.write(sessionId, data),
      resize: (sessionId, size) => bridge.resize(sessionId, size),
      test,
      pickPrivateKey: () => bridge.pickPrivateKey(),
      setCredential: (credentialId, secret) => bridge.setCredential({ credentialId, secret }),
      hasCredential: (credentialId) => bridge.hasCredential(credentialId),
      deleteCredential: (credentialId) => bridge.deleteCredential(credentialId),
      onData,
      pendingHostKey,
      answerHostKey,
      closeAll,
    };
  }, [
    bridge,
    open,
    disconnect,
    close,
    reconnect,
    test,
    onData,
    pendingHostKey,
    answerHostKey,
    closeAll,
  ]);
}
