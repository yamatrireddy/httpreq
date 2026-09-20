import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Server, utils, type Connection } from 'ssh2';
import { createSshProfile, type SshProfile, type SshSessionEvent } from '@httpreq/shared';
import { KnownHostsStore } from './knownHosts';
import { SshSessionManager } from './sessions';

/**
 * The session manager against a real SSH server.
 *
 * `ssh2` provides both halves, so the whole path a terminal depends on is exercised for real:
 * the handshake, host-key verification, password and public-key authentication, the shell
 * channel, and — the part that matters most here — what is left behind afterwards. A test that
 * stubbed the client could not show that a disconnect actually releases the socket, or that a
 * reconnect is a genuinely new session rather than the previous one still running.
 */

const USERNAME = 'tester';
const PASSWORD = 'correct-horse-battery-staple';

const clientKey = utils.generateKeyPairSync('ed25519');
const hostKey = utils.generateKeyPairSync('ed25519');
const clientPublicKey = utils.parseKey(clientKey.public);

interface TestServer {
  port: number;
  close: () => Promise<void>;
  /** Connections the server has accepted, for asserting that a disconnect really disconnected. */
  readonly live: number;
}

const startServer = async (options: { authDelayMs?: number } = {}): Promise<TestServer> => {
  let live = 0;
  const server = new Server({ hostKeys: [hostKey.private] }, (client: Connection) => {
    live += 1;
    client.on('close', () => {
      live -= 1;
    });
    // A server that never sees a successful auth still gets a `close`; nothing else is needed.
    client.on('error', () => undefined);

    client.on('authentication', (context) => {
      const accept = () => {
        if (options.authDelayMs) setTimeout(() => context.accept(), options.authDelayMs);
        else context.accept();
      };
      if (context.username !== USERNAME) return context.reject();
      if (context.method === 'password') {
        return context.password === PASSWORD ? accept() : context.reject();
      }
      if (context.method === 'publickey') {
        if (
          context.key.algo !== (clientPublicKey as { type: string }).type ||
          !(clientPublicKey as { getPublicSSH(): Buffer }).getPublicSSH().equals(context.key.data)
        ) {
          return context.reject();
        }
        if (context.signature) {
          const ok = (
            clientPublicKey as { verify(data: Buffer, sig: Buffer, algo: string): boolean }
          ).verify(context.blob!, context.signature, context.key.algo);
          return ok ? accept() : context.reject();
        }
        // Signature-less probe: tell the client this key would be acceptable.
        return accept();
      }
      return context.reject(['password', 'publickey']);
    });

    client.on('ready', () => {
      client.on('session', (acceptSession) => {
        const session = acceptSession();
        session.on('pty', (accept) => accept?.());
        session.on('window-change', (accept) => accept?.());
        session.on('shell', (acceptShell) => {
          const stream = acceptShell();
          stream.write('welcome to the test shell\r\n$ ');
          // Echo, so the test can prove input reaches the remote end.
          stream.on('data', (chunk: Buffer) => stream.write(`echo:${chunk.toString('utf8')}`));
        });
      });
    });
  });

  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });

  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
    get live() {
      return live;
    },
  };
};

/** Collects everything the manager emits for one sender, in order. */
const createRecorder = () => {
  const events: { sessionId: string; event: SshSessionEvent }[] = [];
  return {
    events,
    emit: (_senderId: number, sessionId: string, event: SshSessionEvent) =>
      events.push({ sessionId, event }),
    statuses: () =>
      events
        .map((item) => item.event)
        .filter((event) => event.type === 'status')
        .map((event) => event.status),
    output: () =>
      events
        .filter((item) => item.event.type === 'data')
        .map((item) => (item.event as { data: string }).data)
        .join(''),
    errors: () =>
      events
        .filter((item) => item.event.type === 'error')
        .map((item) => (item.event as { error: { code: string } }).error),
  };
};

const waitFor = async (predicate: () => boolean, timeoutMs = 4000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the expected state');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const SENDER = 1;
const SIZE = { cols: 100, rows: 30, width: 800, height: 480 };

let server: TestServer;
let directory: string;

const profileFor = (changes: Partial<SshProfile> = {}): SshProfile => ({
  ...createSshProfile('Test host'),
  host: '127.0.0.1',
  port: server.port,
  username: USERNAME,
  authType: 'password',
  connectTimeoutMs: 8000,
  keepAliveSeconds: 0,
  ...changes,
});

const managerWith = (
  recorder: ReturnType<typeof createRecorder>,
  overrides: { secret?: string; knownHosts?: KnownHostsStore } = {},
) =>
  new SshSessionManager(
    {
      credentials: { get: vi.fn().mockResolvedValue(overrides.secret ?? PASSWORD) } as never,
      knownHosts:
        overrides.knownHosts ?? (new KnownHostsStore(join(directory, 'known-hosts.json')) as never),
    },
    recorder.emit,
  );

beforeEach(async () => {
  server = await startServer();
  directory = await mkdtemp(join(tmpdir(), 'httpreq-ssh-'));
});

afterEach(async () => {
  await server.close();
  await rm(directory, { recursive: true, force: true });
});

describe('SshSessionManager', () => {
  it('connects with a password, runs a shell, and releases everything on disconnect', async () => {
    const recorder = createRecorder();
    const manager = managerWith(recorder);

    await manager.connect(
      SENDER,
      { sessionId: 's1', profile: profileFor(), size: SIZE },
      async () => true,
    );

    expect(recorder.statuses()).toEqual(['connecting', 'connected']);
    expect(manager.has(SENDER, 's1')).toBe(true);
    await waitFor(() => recorder.output().includes('welcome to the test shell'));

    manager.write(SENDER, 's1', 'whoami\n');
    await waitFor(() => recorder.output().includes('echo:whoami'));
    // Resizing a live shell must not throw or disturb the session.
    manager.resize(SENDER, 's1', { cols: 132, rows: 43, width: 1100, height: 700 });

    await manager.disconnect(SENDER, 's1');
    expect(recorder.statuses()).toEqual([
      'connecting',
      'connected',
      'disconnecting',
      'disconnected',
    ]);
    expect(manager.has(SENDER, 's1')).toBe(false);
    expect(manager.size).toBe(0);
    // The server sees the socket go away: no orphan connection is left running.
    await waitFor(() => server.live === 0);
  });

  it('starts a clean session when the same terminal reconnects', async () => {
    const recorder = createRecorder();
    const manager = managerWith(recorder);
    const profile = profileFor();

    await manager.connect(SENDER, { sessionId: 's1', profile, size: SIZE }, async () => true);
    await waitFor(() => recorder.output().includes('$ '));
    await manager.disconnect(SENDER, 's1');
    await waitFor(() => server.live === 0);

    const before = recorder.events.length;
    await manager.connect(SENDER, { sessionId: 's1', profile, size: SIZE }, async () => true);
    await waitFor(() =>
      recorder.events
        .slice(before)
        .some(
          (item) => item.event.type === 'data' && item.event.data.includes('welcome to the test'),
        ),
    );

    expect(manager.size).toBe(1);
    expect(server.live).toBe(1);
    // Nothing from the first session reported itself after the second one was up.
    expect(recorder.statuses().slice(-2)).toEqual(['connecting', 'connected']);

    await manager.disconnect(SENDER, 's1');
  });

  it('abandons a handshake the user cancelled while it was still running', async () => {
    const slow = await startServer({ authDelayMs: 400 });
    const recorder = createRecorder();
    const manager = managerWith(recorder);

    try {
      const connecting = manager.connect(
        SENDER,
        { sessionId: 's1', profile: { ...profileFor(), port: slow.port }, size: SIZE },
        async () => true,
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      await manager.disconnect(SENDER, 's1');
      await connecting;

      expect(manager.has(SENDER, 's1')).toBe(false);
      expect(manager.size).toBe(0);
      // The connection that arrived late was closed rather than left running unattached.
      await waitFor(() => slow.live === 0);
      expect(recorder.statuses()).not.toContain('connected');
    } finally {
      await slow.close();
    }
  });

  it('authenticates with a private key', async () => {
    const keyPath = join(directory, 'id_ed25519');
    await writeFile(keyPath, clientKey.private, 'utf8');
    const recorder = createRecorder();
    const manager = managerWith(recorder, { secret: '' });

    await manager.connect(
      SENDER,
      {
        sessionId: 's1',
        profile: profileFor({ authType: 'key', privateKeyPath: keyPath }),
        size: SIZE,
      },
      async () => true,
    );

    expect(recorder.statuses()).toEqual(['connecting', 'connected']);
    await manager.disconnect(SENDER, 's1');
  });

  it('reports a wrong password as an authentication failure and leaves no session', async () => {
    const recorder = createRecorder();
    const manager = managerWith(recorder, { secret: 'not-the-password' });

    await expect(
      manager.connect(
        SENDER,
        { sessionId: 's1', profile: profileFor(), size: SIZE },
        async () => true,
      ),
    ).rejects.toMatchObject({ code: 'SSH_AUTH_FAILED' });

    expect(manager.size).toBe(0);
    expect(recorder.statuses()).toEqual(['connecting', 'disconnected']);
    await waitFor(() => server.live === 0);
  });

  it('refuses to connect when the host key is rejected, and remembers one that is trusted', async () => {
    const knownHosts = new KnownHostsStore(join(directory, 'known-hosts.json'));
    const rejecting = createRecorder();
    const manager = managerWith(rejecting, { knownHosts });
    const profile = profileFor();

    await expect(
      manager.connect(SENDER, { sessionId: 's1', profile, size: SIZE }, async () => false),
    ).rejects.toMatchObject({ code: 'SSH_HOST_KEY_REJECTED' });
    expect(manager.size).toBe(0);
    expect(await knownHosts.list()).toEqual([]);

    // Trusting it once records the fingerprint…
    const prompts: string[] = [];
    await manager.connect(SENDER, { sessionId: 's2', profile, size: SIZE }, async (prompt) => {
      prompts.push(prompt.fingerprint);
      return true;
    });
    expect(prompts).toHaveLength(1);
    expect(await knownHosts.list()).toMatchObject([{ host: '127.0.0.1', port: server.port }]);
    await manager.disconnect(SENDER, 's2');

    // …so the next connection to the same host is not asked about again.
    await manager.connect(SENDER, { sessionId: 's3', profile, size: SIZE }, async (prompt) => {
      prompts.push(prompt.fingerprint);
      return true;
    });
    expect(prompts).toHaveLength(1);
    await manager.disconnect(SENDER, 's3');
  });

  it('closes every session a window owned when it goes away', async () => {
    const recorder = createRecorder();
    const manager = managerWith(recorder);
    const profile = profileFor();

    await manager.connect(SENDER, { sessionId: 's1', profile, size: SIZE }, async () => true);
    await manager.connect(SENDER, { sessionId: 's2', profile, size: SIZE }, async () => true);
    expect(manager.list(SENDER).sort()).toEqual(['s1', 's2']);

    manager.disposeForSender(SENDER);
    expect(manager.size).toBe(0);
    await waitFor(() => server.live === 0);
  });
});
