import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import {
  drainQueue,
  overlayPendingOperations,
  type Route,
  type Profile,
  type QueueItem,
  type Operation,
  type Position,
} from "@fasttrack/core";
import { backend } from "./backend";
const databases = new Map<string, Promise<SQLite.SQLiteDatabase>>();
async function db(user: string) {
  if (!/^[0-9a-f-]{36}$/i.test(user)) throw new Error("Usuário inválido.");
  let promise = databases.get(user);
  if (!promise) {
    promise = (async () => {
      const name = `fasttrack-${user}`,
        keyName = `db-key-${user}`;
      let key = await SecureStore.getItemAsync(keyName);
      if (!key) {
        key =
          Crypto.randomUUID().replaceAll("-", "") +
          Crypto.randomUUID().replaceAll("-", "");
        await SecureStore.setItemAsync(keyName, key);
      }
      if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("Chave local inválida.");
      const d = await SQLite.openDatabaseAsync(`${name}.db`);
      await d.execAsync(
        `PRAGMA key = "x'${key}'"; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS queue (seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,body TEXT NOT NULL);`,
      );
      return d;
    })();
    databases.set(user, promise);
    promise.catch(() => databases.delete(user));
  }
  return promise;
}
export async function cached<T>(user: string, key: string): Promise<T | null> {
  const row = await (
    await db(user)
  ).getFirstAsync<{ value: string }>(
    "SELECT value FROM cache WHERE key=?",
    key,
  );
  return row ? (JSON.parse(row.value) as T) : null;
}
export async function put(user: string, key: string, value: unknown) {
  await (
    await db(user)
  ).runAsync(
    "INSERT OR REPLACE INTO cache(key,value) VALUES(?,?)",
    key,
    JSON.stringify(value),
  );
}
export async function queue(user: string): Promise<QueueItem[]> {
  const rows = await (
    await db(user)
  ).getAllAsync<{ body: string }>("SELECT body FROM queue ORDER BY seq");
  return rows.map((row) => JSON.parse(row.body) as QueueItem);
}
export async function saveRemoteRoutes(user: string, routes: Route[]) {
  const d = await db(user);
  await d.withExclusiveTransactionAsync(async (tx) => {
    const rows = await tx.getAllAsync<{ body: string }>(
      "SELECT body FROM queue ORDER BY seq",
    );
    const merged = overlayPendingOperations(
      routes,
      rows.map((x) => JSON.parse(x.body)),
    );
    await tx.runAsync(
      "INSERT OR REPLACE INTO cache(key,value) VALUES(?,?)",
      "routes",
      JSON.stringify(merged),
    );
  });
}
export async function enqueue(
  user: string,
  kind: QueueItem["kind"],
  payload: Operation | Position,
) {
  const d = await db(user);
  const item: QueueItem = {
    id: payload.id,
    kind,
    payload,
    attempts: 0,
    nextAttemptAt: 0,
  };
  await d.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      "INSERT INTO queue(id,body) VALUES(?,?)",
      item.id,
      JSON.stringify(item),
    );
    if (kind === "operation") {
      const row = await tx.getFirstAsync<{ value: string }>(
        "SELECT value FROM cache WHERE key=?",
        "routes",
      );
      if (!row) throw new Error("Sincronize a rota antes de operar offline.");
      await tx.runAsync(
        "UPDATE cache SET value=? WHERE key=?",
        JSON.stringify(overlayPendingOperations(JSON.parse(row.value), [item])),
        "routes",
      );
    }
  });
}
let syncing: Promise<void> | null = null;
export async function sync(user: string) {
  if (syncing) return syncing;
  syncing = (async () => {
    const {
      data: { session },
    } = await backend.auth.getSession();
    if (session?.user.id !== user)
      throw new Error("Sessão necessária para sincronizar.");
    const d = await db(user);
    await drainQueue(
      await queue(user),
      async (item) => {
        const { error } = await backend.rpc(
          item.kind === "operation" ? "record_operation" : "record_position",
          item.kind === "operation"
            ? { p_event: item.payload }
            : { p_position: item.payload },
        );
        if (error) throw new Error(error.message);
      },
      async (id) => {
        await d.runAsync("DELETE FROM queue WHERE id=?", id);
      },
      async (item) => {
        await d.runAsync(
          "UPDATE queue SET body=? WHERE id=?",
          JSON.stringify(item),
          item.id,
        );
      },
    );
  })();
  try {
    await syncing;
  } finally {
    syncing = null;
  }
}
export async function saveProfile(profile: Profile) {
  await put(profile.id, "profile", profile);
}
