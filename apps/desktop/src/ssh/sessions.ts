import type { Client, ClientChannel } from 'ssh2';
import {
  sshErrorOf,
  type SshConnectOptions,
  type SshProfile,
  type SshSessionEvent,
  type TerminalSize,
} from '@httpreq/shared';
import {
  openConnection,
  toSshError,
  type ConnectionDeps,
  type HostKeyApprover,
} from './connection';

/**
 * Interactive SSH shells.
 *
 * Sessions are keyed by the window that created them as well as by their own id, so one renderer
 * can never read from or write to another's shell. Every exit path — the user disconnecting, the
 * window closing, the app quitting — runs {@link Session.dispose}, so no orphan channel or socket
 * is left behind.
 */

const sessionKey = (senderId: number, sessionId: string) => `${senderId}:${sessionId}`;

interface Session {
  client: Client;
  channel: ClientChannel | null;
  dispose: () => void;
}

export type SessionEmitter = (senderId: number, sessionId: string, event: SshSessionEvent) => void;

export class SshSessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly deps: ConnectionDeps,
    private readonly emit: SessionEmitter,
  ) {}

  list(senderId: number): string[] {
    const prefix = `${senderId}:`;
    return [...this.sessions.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }

  get size(): number {
    return this.sessions.size;
  }

  has(senderId: number, sessionId: string): boolean {
    return this.sessions.has(sessionKey(senderId, sessionId));
  }

  /** Opens a connection and an interactive shell. Reports progress through session events. */
  async connect(
    senderId: number,
    options: SshConnectOptions,
    approveHostKey: HostKeyApprover,
  ): Promise<void> {
    const { sessionId, profile, size } = options;
    const key = sessionKey(senderId, sessionId);
    if (this.sessions.has(key)) await this.disconnect(senderId, sessionId);

    const send = (event: SshSessionEvent) => this.emit(senderId, sessionId, event);
    send({ type: 'status', status: 'connecting' });

    let client: Client;
    try {
      ({ client } = await openConnection(profile, this.deps, approveHostKey));
    } catch (error) {
      const info = toSshError(error);
      send({ type: 'error', error: info });
      send({ type: 'status', status: 'disconnected' });
      throw info;
    }

    // The session is registered before the shell opens, so a disconnect during `shell()` still
    // finds something to tear down.
    const session: Session = {
      client,
      channel: null,
      dispose: () => {
        session.channel?.removeAllListeners();
        session.channel?.end();
        client.removeAllListeners();
        client.end();
        client.destroy();
      },
    };
    this.sessions.set(key, session);

    const teardown = (event: SshSessionEvent) => {
      if (this.sessions.get(key) !== session) return;
      this.sessions.delete(key);
      session.dispose();
      send(event);
      send({ type: 'status', status: 'disconnected' });
    };

    client.on('error', (error: Error) => teardown({ type: 'error', error: toSshError(error) }));
    client.on('close', () => teardown({ type: 'closed', code: null, signal: null }));

    try {
      const channel = await new Promise<ClientChannel>((resolve, reject) => {
        client.shell(
          {
            term: 'xterm-256color',
            cols: size.cols,
            rows: size.rows,
            width: size.width,
            height: size.height,
          },
          (error, stream) => (error ? reject(error) : resolve(stream)),
        );
      });
      session.channel = channel;
      channel.on('data', (chunk: Buffer) => send({ type: 'data', data: chunk.toString('utf8') }));
      channel.stderr.on('data', (chunk: Buffer) =>
        send({ type: 'data', data: chunk.toString('utf8') }),
      );
      channel.on('close', (code: number | null, signal: string | null) =>
        teardown({ type: 'closed', code: code ?? null, signal: signal ?? null }),
      );
      send({ type: 'status', status: 'connected' });
    } catch (error) {
      const info = toSshError(error);
      this.sessions.delete(key);
      session.dispose();
      send({ type: 'error', error: info });
      send({ type: 'status', status: 'disconnected' });
      throw info;
    }
  }

  /** Opens a connection, confirms the handshake, and closes it again. */
  async test(profile: SshProfile, approveHostKey: HostKeyApprover): Promise<{ banner: string }> {
    const { client, banner } = await openConnection(profile, this.deps, approveHostKey);
    client.removeAllListeners();
    client.end();
    client.destroy();
    return { banner };
  }

  write(senderId: number, sessionId: string, data: string): void {
    this.sessions.get(sessionKey(senderId, sessionId))?.channel?.write(data);
  }

  resize(senderId: number, sessionId: string, size: TerminalSize): void {
    this.sessions
      .get(sessionKey(senderId, sessionId))
      ?.channel?.setWindow(size.rows, size.cols, size.height, size.width);
  }

  async disconnect(senderId: number, sessionId: string): Promise<void> {
    const key = sessionKey(senderId, sessionId);
    const session = this.sessions.get(key);
    if (!session) return;
    this.sessions.delete(key);
    this.emit(senderId, sessionId, { type: 'status', status: 'disconnecting' });
    session.dispose();
    this.emit(senderId, sessionId, { type: 'status', status: 'disconnected' });
  }

  /** Closes every session owned by one window; used when it navigates away or is destroyed. */
  disposeForSender(senderId: number): void {
    for (const sessionId of this.list(senderId)) {
      const session = this.sessions.get(sessionKey(senderId, sessionId));
      this.sessions.delete(sessionKey(senderId, sessionId));
      session?.dispose();
    }
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) session.dispose();
    this.sessions.clear();
  }
}

export { sshErrorOf };
