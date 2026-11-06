import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createSecureSessionStorage,
  mobileErrorMessage,
  SecureSessionStorageError,
} from "../../apps/mobile/src/secure-session";

const key = "sb-secure-test-auth-token";
const databaseKey = "db-key-00000000-0000-4000-8000-000000000001";
const decryptError = () =>
  Object.assign(
    new Error("Could not decrypt the value. Keystore operation failed"),
    {
      code: "ERR_DECRYPT",
    },
  );

function fixture(seed: Record<string, string> = {}) {
  const entries = new Map(Object.entries(seed));
  const store = {
    getItemAsync: vi.fn(async (name: string) => entries.get(name) ?? null),
    setItemAsync: vi.fn(async (name: string, value: string) => {
      entries.set(name, value);
    }),
    deleteItemAsync: vi.fn(async (name: string) => {
      entries.delete(name);
    }),
  };
  return { entries, store, storage: createSecureSessionStorage(store) };
}

describe("sessão móvel em armazenamento seguro", () => {
  it("reabre uma sessão grande com Unicode sem exceder o limite de bytes por entrada", async () => {
    const f = fixture();
    const value = JSON.stringify({
      token: "fixture-token",
      name: "🚚Á".repeat(1400),
    });
    await f.storage.setItem(key, value);
    const reopened = createSecureSessionStorage(f.store);
    expect(await reopened.getItem(key)).toBe(value);
    for (const [name, item] of f.entries)
      if (name !== `${key}.count`)
        expect(Buffer.byteLength(item, "utf8")).toBeLessThanOrEqual(1800);
  });

  it("retorna ausência de sessão sem alterar outras informações do aparelho", async () => {
    const f = fixture({ [databaseKey]: "encrypted-database-key" });
    expect(await f.storage.getItem(key)).toBeNull();
    expect(f.store.deleteItemAsync).not.toHaveBeenCalled();
    expect(f.entries.get(databaseKey)).toBe("encrypted-database-key");
  });

  it("recupera metadados indecifráveis sem apagar chaves do banco, GPS ou outra conta", async () => {
    const untouched = {
      [databaseKey]: "encrypted-database-key",
      "fasttrack-active-route": "encrypted-active-route",
      "sb-another-project-auth-token.count": "1",
      "sb-another-project-auth-token.0": "another-encrypted-session",
    };
    const f = fixture({
      ...untouched,
      [`${key}.count`]: "unreadable",
      [`${key}.0`]: "old",
    });
    f.store.getItemAsync.mockImplementation(async (name) => {
      if (f.entries.get(name) === "unreadable") throw decryptError();
      return f.entries.get(name) ?? null;
    });
    expect(await f.storage.getItem(key)).toBeNull();
    expect(Object.fromEntries(f.entries)).toEqual(untouched);
    await f.storage.setItem(key, "new-session");
    expect(await f.storage.getItem(key)).toBe("new-session");
  });

  it("recupera um fragmento indecifrável e uma gravação interrompida", async () => {
    const f = fixture({ [`${key}.count`]: "2", [`${key}.0`]: "unreadable" });
    f.store.getItemAsync.mockImplementation(async (name) => {
      if (f.entries.get(name) === "unreadable") throw decryptError();
      return f.entries.get(name) ?? null;
    });
    expect(await f.storage.getItem(key)).toBeNull();
    f.entries.set(`${key}.count`, "2");
    f.entries.set(`${key}.0`, "only-half");
    expect(await f.storage.getItem(key)).toBeNull();
    expect(f.entries.size).toBe(0);
  });

  it.each(["0", "-1", "NaN", "Infinity", "1000000000", "65", "1.5"])(
    "limita a recuperação quando a quantidade armazenada é %s",
    async (count) => {
      const f = fixture({ [`${key}.count`]: count });
      expect(await f.storage.getItem(key)).toBeNull();
      expect(f.store.getItemAsync).toHaveBeenCalledTimes(1);
      expect(f.store.deleteItemAsync.mock.calls.length).toBeLessThan(70);
    },
  );

  it("permite novo login sem ler o contador antigo que estava ilegível", async () => {
    const f = fixture({
      [`${key}.count`]: "unreadable",
      [`${key}.4`]: "old-session",
    });
    f.store.getItemAsync.mockImplementation(async (name) => {
      if (f.entries.get(name) === "unreadable") throw decryptError();
      return f.entries.get(name) ?? null;
    });
    await f.storage.setItem(key, "new-session");
    expect(await f.storage.getItem(key)).toBe("new-session");
    expect(f.entries.has(`${key}.4`)).toBe(false);
  });

  it("recusa a sessão quando o emulador aceita a escrita mas falha ao descriptografar", async () => {
    const f = fixture({ [databaseKey]: "encrypted-database-key" });
    f.store.getItemAsync.mockRejectedValue(decryptError());
    await expect(f.storage.setItem(key, "private-session")).rejects.toThrow(
      "Android 11",
    );
    expect(Object.fromEntries(f.entries)).toEqual({
      [databaseKey]: "encrypted-database-key",
    });
  });

  it("preserva a causa como indisponibilidade sem apagar dados por falha genérica de leitura", async () => {
    const f = fixture({ [`${key}.count`]: "1", [`${key}.0`]: "saved-session" });
    f.store.getItemAsync.mockRejectedValue(new Error("Native IO unavailable"));
    await expect(f.storage.getItem(key)).rejects.toBeInstanceOf(
      SecureSessionStorageError,
    );
    expect(f.store.deleteItemAsync).not.toHaveBeenCalled();
  });

  it("não deixa uma sessão parcial válida quando a escrita de um fragmento falha", async () => {
    const f = fixture({ [databaseKey]: "encrypted-database-key" });
    f.store.setItemAsync.mockImplementation(async (name, value) => {
      if (name === `${key}.1`) throw new Error("Native write failed");
      f.entries.set(name, value);
    });
    await expect(f.storage.setItem(key, "t".repeat(4000))).rejects.toThrow(
      "armazenamento seguro",
    );
    expect(await f.storage.getItem(key)).toBeNull();
    expect(f.entries.get(databaseKey)).toBe("encrypted-database-key");
  });

  it("remove a sessão no logout mesmo sem conseguir ler seus metadados", async () => {
    const f = fixture({
      [databaseKey]: "encrypted-database-key",
      [`${key}.count`]: "unreadable",
      [`${key}.0`]: "session",
      [`${key}.63`]: "orphaned-fragment",
    });
    f.store.getItemAsync.mockRejectedValue(decryptError());
    await f.storage.removeItem(key);
    expect(f.store.getItemAsync).not.toHaveBeenCalled();
    expect(Object.fromEntries(f.entries)).toEqual({
      [databaseKey]: "encrypted-database-key",
    });
  });

  it("não declara recuperação concluída quando a remoção local falha", async () => {
    const f = fixture({ [`${key}.count`]: "unreadable" });
    f.store.getItemAsync.mockRejectedValue(decryptError());
    f.store.deleteItemAsync.mockRejectedValue(
      new Error("Native delete failed"),
    );
    await expect(f.storage.getItem(key)).rejects.toThrow(
      "armazenamento seguro",
    );
  });

  it("serializa gravação, leitura e logout para não expor uma sessão parcial", async () => {
    const f = fixture();
    let release!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.store.setItemAsync.mockImplementation(async (name, value) => {
      if (name === `${key}.0`) {
        started();
        await blocked;
      }
      f.entries.set(name, value);
    });
    const saving = f.storage.setItem(key, "saved-session");
    await ready;
    const reading = f.storage.getItem(key);
    const removing = f.storage.removeItem(key);
    expect(f.store.getItemAsync).not.toHaveBeenCalled();
    release();
    await saving;
    expect(await reading).toBe("saved-session");
    await removing;
    expect(await f.storage.getItem(key)).toBeNull();
  });

  it("apresenta orientação legível sem expor detalhes ou chaves de armazenamento", () => {
    const native = new Error(
      "ExpoSecureStore.getValueWithKeyAsync: Could not decrypt sb-private-auth-token.count under key_v1",
    );
    expect(mobileErrorMessage(native)).toContain("Android 11");
    expect(mobileErrorMessage(native)).not.toMatch(
      /sb-private|key_v1|getValue/,
    );
    expect(mobileErrorMessage(new Error("Senha inválida."))).toBe(
      "Senha inválida.",
    );
    expect(
      mobileErrorMessage({ message: "Documento não corresponde à carga." }),
    ).toBe("Documento não corresponde à carga.");
    expect(
      mobileErrorMessage(new Error("Error code 26: file is not a database")),
    ).toBe(
      "Não foi possível abrir os registros locais. Preserve os dados do aplicativo e informe ao gestor.",
    );
  });

  it("persiste e reabre a sessão com o SDK Supabase real após recuperar registros inválidos", async () => {
    const f = fixture({ [`${key}.count`]: "unreadable" });
    f.store.getItemAsync.mockImplementation(async (name) => {
      if (f.entries.get(name) === "unreadable") throw decryptError();
      return f.entries.get(name) ?? null;
    });
    const userId = "00000000-0000-4000-8000-000000000001";
    const encoded = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture-signature`;
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({
        access_token: token,
        refresh_token: "fixture-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        user: {
          id: userId,
          email: "driver@example.test",
          user_metadata: {},
          app_metadata: {},
        },
      }),
    );
    const makeClient = () =>
      createClient("https://secure-test.supabase.co", "fixture-public-key", {
        global: { fetch: request },
        auth: {
          storage: f.storage,
          storageKey: key,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    const first = makeClient();
    await first.auth.initialize();
    const signedIn = await first.auth.signInWithPassword({
      email: "driver@example.test",
      password: "fixture-only-password",
    });
    expect(signedIn.error).toBeNull();
    const reopened = makeClient();
    const session = await reopened.auth.getSession();
    expect(session.error).toBeNull();
    expect(session.data.session?.user.id).toBe(userId);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
