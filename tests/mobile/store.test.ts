import { afterAll, describe, expect, it, vi } from "vitest";
import type { Position, Profile } from "@fasttrack/core";

const state = vi.hoisted(() => ({
  secure: new Map<string, string>(),
  keys: new Map<string, string>(),
  close: [] as Array<() => Promise<void>>,
  cleanup: () => {},
  user: "",
  rpcError: null as string | null,
}));

// Use actual SQLite for SQL and rollback semantics. Model SQLCipher's per-
// connection key requirement, including Expo's extra exclusive connection.
// This is not a test of the native Android binding or encryption algorithm.
vi.mock("expo-sqlite", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = mkdtempSync(join(tmpdir(), "fasttrack-mobile-store-"));
  state.cleanup = () => rmSync(directory, { recursive: true, force: true });

  async function openDatabaseAsync(name: string, _options = {}) {
    const native = new DatabaseSync(join(directory, name));
    let key: string | null = null;
    let closed = false;
    function requireKey() {
      if (!key || state.keys.get(name) !== key)
        throw new Error("Error code 26: file is not a database");
    }
    const connection = {
      async execAsync(sql: string) {
        for (const command of sql
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)) {
          const match = command.match(/^PRAGMA key\s*=\s*"x'([a-f0-9]{64})'"$/);
          if (match) {
            key = match[1];
            if (!state.keys.has(name)) state.keys.set(name, key);
            continue;
          }
          requireKey();
          native.exec(command);
        }
      },
      async runAsync(sql: string, ...params: (string | number | null)[]) {
        requireKey();
        return native.prepare(sql).run(...params);
      },
      async getAllAsync(sql: string, ...params: (string | number | null)[]) {
        requireKey();
        return native.prepare(sql).all(...params);
      },
      async getFirstAsync(sql: string, ...params: (string | number | null)[]) {
        requireKey();
        return native.prepare(sql).get(...params) ?? null;
      },
      async closeAsync() {
        if (!closed) {
          native.close();
          closed = true;
        }
      },
      async withExclusiveTransactionAsync(
        task: (tx: typeof connection) => Promise<void>,
      ) {
        // This matches Expo SDK 58: transaction = a new, unkeyed connection.
        const tx = await openDatabaseAsync(name, { useNewConnection: true });
        try {
          await tx.execAsync("BEGIN");
          await task(tx);
          await tx.execAsync("COMMIT");
        } catch (error) {
          try {
            await tx.execAsync("ROLLBACK");
          } catch {
            /* preserve error */
          }
          throw error;
        } finally {
          await tx.closeAsync();
        }
      },
    };
    state.close.push(() => connection.closeAsync());
    return connection;
  }
  return { openDatabaseAsync };
});

vi.mock("expo-secure-store", () => ({
  getItemAsync: async (name: string) => state.secure.get(name) ?? null,
  setItemAsync: async (name: string, value: string) => {
    state.secure.set(name, value);
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock("../../apps/mobile/src/backend", () => ({
  backend: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: state.user } } },
      }),
    },
    rpc: async () => ({
      error: state.rpcError ? { message: state.rpcError } : null,
    }),
  },
}));

import {
  cached,
  enqueue,
  queue,
  saveProfile,
  saveRemoteRoutes,
  sync,
} from "../../apps/mobile/src/store";

afterAll(async () => {
  for (const close of state.close) await close();
  state.cleanup();
});

function profile(): Profile {
  return {
    id: crypto.randomUUID(),
    tenant_id: crypto.randomUUID(),
    role: "motorista",
    name: "Motorista de teste",
    phone: null,
  };
}
function position(user: string): Position {
  return {
    id: crypto.randomUUID(),
    route_id: crypto.randomUUID(),
    driver_id: user,
    latitude: -23.31,
    longitude: -51.16,
    accuracy: 10,
    captured_at: "2026-11-06T12:00:00.000Z",
  };
}

describe("transações do banco móvel", () => {
  it("sincroniza rotas após salvar o perfil sem depender da chave de outra conexão", async () => {
    const p = profile();
    await saveProfile(p);
    await saveRemoteRoutes(p.id, []);
    expect(await cached(p.id, "routes")).toEqual([]);
    expect(await cached(p.id, "profile")).toEqual(p);
    expect(await queue(p.id)).toEqual([]);
  });

  it("preserva o UUID e o horário da fila quando o envio ao servidor falha", async () => {
    const p = profile();
    const payload = position(p.id);
    await enqueue(p.id, "position", payload);
    state.user = p.id;
    state.rpcError = "Serviço indisponível no teste";
    try {
      await sync(p.id);
      expect(await queue(p.id)).toMatchObject([
        { id: payload.id, payload, attempts: 1 },
      ]);
    } finally {
      state.rpcError = null;
    }
  });

  it("reverte a inserção na fila se não houver rota sincronizada para a operação", async () => {
    const p = profile();
    await expect(
      enqueue(p.id, "operation", {
        id: crypto.randomUUID(),
        route_id: crypto.randomUUID(),
        delivery_id: crypto.randomUUID(),
        kind: "check_in",
        code: "NF-TESTE",
        captured_at: "2026-11-06T12:00:00.000Z",
      }),
    ).rejects.toThrow("Sincronize a rota");
    expect(await queue(p.id)).toEqual([]);
  });

  it("preserva a fila existente quando a chave segura não está disponível para outra conexão", async () => {
    const p = profile();
    const payload = position(p.id);
    await enqueue(p.id, "position", payload);
    state.secure.delete(`db-key-${p.id}`);
    await expect(enqueue(p.id, "position", position(p.id))).rejects.toThrow(
      "Chave local",
    );
    expect(await queue(p.id)).toMatchObject([{ id: payload.id, payload }]);
    expect(state.secure.has(`db-key-${p.id}`)).toBe(false);
  });
});
