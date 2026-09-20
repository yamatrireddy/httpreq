/**
 * The one storage primitive the repositories are written against: an async key/value store of
 * JSON-serializable values.
 *
 * Both platforms reuse the same repository implementation on top of it, so workspace semantics
 * (isolation, the workspace index, the active-workspace pointer) exist in exactly one place. The
 * browser backs it with IndexedDB, and `localStorage` remains available as a fallback and for the
 * legacy data written before workspaces existed.
 */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every key, optionally limited to those starting with `prefix`. */
  keys(prefix?: string): Promise<string[]>;
}

/** In-memory store, for tests and as the last-resort fallback when nothing else is writable. */
export class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<unknown> {
    const raw = this.values.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as unknown);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async keys(prefix = ''): Promise<string[]> {
    return [...this.values.keys()].filter((key) => key.startsWith(prefix));
  }

  get size(): number {
    return this.values.size;
  }
}

/**
 * `localStorage`/`sessionStorage` behind the async interface. Keys are namespaced so the store
 * can share a `Storage` with unrelated application data.
 */
export class WebStorageStore implements KeyValueStore {
  constructor(
    private readonly storage: Storage = localStorage,
    private readonly prefix = '',
  ) {}

  private full(key: string) {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<unknown> {
    const raw = this.storage.getItem(this.full(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      // Corrupted entries read as missing rather than breaking the whole load.
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    this.storage.setItem(this.full(key), JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    this.storage.removeItem(this.full(key));
  }

  async keys(prefix = ''): Promise<string[]> {
    const search = this.full(prefix);
    const found: string[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (key?.startsWith(search)) found.push(key.slice(this.prefix.length));
    }
    return found;
  }
}

const DB_VERSION = 1;

/**
 * IndexedDB store. Chosen over `localStorage` for workspace data because it is asynchronous,
 * far larger, and stores structured values without a JSON round trip on every read.
 *
 * The database handle is opened lazily and shared. When IndexedDB is unavailable or blocked
 * (private windows, disabled site data), `open` rejects and {@link createBrowserStore} falls back.
 */
export class IndexedDbStore implements KeyValueStore {
  private handle: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly databaseName = 'httpreq',
    private readonly storeName = 'keyvalue',
  ) {}

  private open(): Promise<IDBDatabase> {
    this.handle ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is unavailable.'));
        return;
      }
      const request = indexedDB.open(this.databaseName, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.storeName)) {
          request.result.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => {
        // A later version opened elsewhere closes this connection; drop the cached handle so the
        // next call reopens instead of using a dead database.
        request.result.onversionchange = () => {
          request.result.close();
          this.handle = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
      request.onblocked = () => reject(new Error('IndexedDB is blocked by another connection.'));
    });
    return this.handle;
  }

  private async run<T>(
    mode: IDBTransactionMode,
    body: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, mode);
      const request = body(transaction.objectStore(this.storeName));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB aborted.'));
    });
  }

  async get(key: string): Promise<unknown> {
    const value = await this.run<unknown>('readonly', (store) => store.get(key));
    return value === undefined ? null : value;
  }

  async set(key: string, value: unknown): Promise<void> {
    // Structured clone rejects proxies and class instances; a JSON round trip keeps writes plain.
    await this.run('readwrite', (store) => store.put(JSON.parse(JSON.stringify(value)), key));
  }

  async delete(key: string): Promise<void> {
    await this.run('readwrite', (store) => store.delete(key));
  }

  async keys(prefix = ''): Promise<string[]> {
    const keys = await this.run<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
    return keys
      .filter((key): key is string => typeof key === 'string')
      .filter((key) => key.startsWith(prefix));
  }
}

/**
 * The best store this browser can offer: IndexedDB, falling back to `localStorage` and finally to
 * memory. The fallback is decided by a real probe write, because availability cannot be detected
 * from feature flags alone (private windows expose the APIs and then reject the operations).
 */
export const createBrowserStore = async (): Promise<KeyValueStore> => {
  const indexed = new IndexedDbStore();
  try {
    await indexed.keys();
    return indexed;
  } catch {
    // Falls through to the synchronous backends.
  }
  try {
    const store = new WebStorageStore(localStorage, 'httpreq.kv.');
    await store.set('__probe', 1);
    await store.delete('__probe');
    return store;
  } catch {
    return new MemoryStore();
  }
};
