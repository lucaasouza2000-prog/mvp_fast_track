/** Only Supabase session entries use this adapter. Database keys and offline
 * deliveries must never be removed while recovering an unreadable session. */
export interface SecureSessionStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const CHUNK_BYTES = 1800;
const MAX_CHUNKS = 64;
const UNAVAILABLE =
  "O armazenamento seguro está indisponível. Reinicie o aplicativo. Se estiver usando BlueStacks, teste uma instância Android 11 ou superior.";

export class SecureSessionStorageError extends Error {
  constructor() {
    super(UNAVAILABLE);
    this.name = "SecureSessionStorageError";
  }
}

class InvalidStoredSession extends Error {}

function errorMessage(error: unknown) {
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === "string") return message;
  return typeof error === "string"
    ? error
    : "Não foi possível concluir a operação.";
}

function isDecryptionError(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  const message = errorMessage(error);
  return (
    code === "ERR_DECRYPT" ||
    code === "ERR_SECURESTORE_DECRYPT_ERROR" ||
    /could not decrypt|keystore operation failed/i.test(message)
  );
}

export function mobileErrorMessage(error: unknown) {
  const message = errorMessage(error);
  if (
    error instanceof SecureSessionStorageError ||
    isDecryptionError(error) ||
    /ExpoSecureStore|SecureStore|keystore/i.test(message)
  )
    return UNAVAILABLE;
  return message || "Não foi possível concluir a operação.";
}

function chunksOf(value: string) {
  const chunks: string[] = [];
  let chunk = "";
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    const size =
      point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes + size > CHUNK_BYTES) {
      chunks.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += character;
    bytes += size;
  }
  chunks.push(chunk);
  if (chunks.length > MAX_CHUNKS) throw new SecureSessionStorageError();
  return chunks;
}

export function createSecureSessionStorage(store: SecureSessionStore) {
  // Auth startup, refresh and sign-out can overlap. Never expose half a write.
  let pending: Promise<unknown> = Promise.resolve();
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }

  async function removeEntries(keys: string[]) {
    const result = await Promise.allSettled(
      keys.map((entry) => store.deleteItemAsync(entry)),
    );
    if (result.some((entry) => entry.status === "rejected"))
      throw new SecureSessionStorageError();
  }

  async function clear(key: string) {
    // Do not read .count: it may be the entry that cannot be decrypted.
    await removeEntries([
      `${key}.count`,
      ...Array.from({ length: MAX_CHUNKS }, (_, i) => `${key}.${i}`),
    ]);
  }

  async function read(key: string) {
    const raw = await store.getItemAsync(`${key}.count`);
    if (raw === null) return null;
    if (!/^[1-9]\d?$/.test(raw) || Number(raw) > MAX_CHUNKS)
      throw new InvalidStoredSession();
    const chunks = await Promise.allSettled(
      Array.from({ length: Number(raw) }, (_, i) =>
        store.getItemAsync(`${key}.${i}`),
      ),
    );
    return chunks
      .map((chunk) => {
        if (chunk.status === "rejected") throw chunk.reason;
        if (chunk.value === null) throw new InvalidStoredSession();
        return chunk.value;
      })
      .join("");
  }

  return {
    getItem(key: string): Promise<string | null> {
      return serial(async () => {
        try {
          return await read(key);
        } catch (error) {
          if (
            error instanceof InvalidStoredSession ||
            isDecryptionError(error)
          ) {
            await clear(key);
            return null;
          }
          throw new SecureSessionStorageError();
        }
      });
    },
    setItem(key: string, value: string): Promise<void> {
      return serial(async () => {
        const chunks = chunksOf(value);
        try {
          // .count is the commit marker. Overwrite without decrypting stale data.
          await store.deleteItemAsync(`${key}.count`);
          for (let i = 0; i < chunks.length; i++)
            await store.setItemAsync(`${key}.${i}`, chunks[i]);
          await store.setItemAsync(`${key}.count`, String(chunks.length));
          // Some emulators accept writes but cannot decrypt them. Fail the login
          // before claiming a persistent session exists; never fall back to plaintext.
          if ((await read(key)) !== value)
            throw new SecureSessionStorageError();
          await removeEntries(
            Array.from(
              { length: MAX_CHUNKS - chunks.length },
              (_, i) => `${key}.${i + chunks.length}`,
            ),
          );
        } catch {
          await clear(key);
          throw new SecureSessionStorageError();
        }
      });
    },
    removeItem(key: string): Promise<void> {
      return serial(() => clear(key));
    },
  };
}
