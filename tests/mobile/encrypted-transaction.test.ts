import { describe, expect, it, vi } from "vitest";
import { withEncryptedTransaction } from "../../apps/mobile/src/encrypted-transaction";

const fixtureKey = "ab".repeat(32);
function fixture() {
  const connection = {
    execAsync: vi.fn(async (_sql: string) => {}),
    closeAsync: vi.fn(async () => {}),
  };
  return { connection, open: vi.fn(async () => connection) };
}

describe("ciclo de transação criptografada", () => {
  it("recusa chave inválida antes de abrir outra conexão", async () => {
    const f = fixture();
    await expect(
      withEncryptedTransaction(f.open, "invalid-key", async () => {}),
    ).rejects.toThrow("Chave local inválida");
    expect(f.open).not.toHaveBeenCalled();
  });

  it("fecha a conexão e não executa o trabalho se a abertura criptografada falhar", async () => {
    const f = fixture();
    const task = vi.fn(async () => {});
    const failure = new Error("file is not a database");
    f.connection.execAsync.mockRejectedValue(failure);
    await expect(
      withEncryptedTransaction(f.open, fixtureKey, task),
    ).rejects.toBe(failure);
    expect(task).not.toHaveBeenCalled();
    expect(f.connection.closeAsync).toHaveBeenCalledOnce();
  });

  it("preserva o erro da operação mesmo se rollback e fechamento também falharem", async () => {
    const f = fixture();
    const failure = new Error("Falha na gravação local");
    f.connection.execAsync.mockImplementation(async (sql) => {
      if (sql === "ROLLBACK") throw new Error("Rollback failed");
    });
    f.connection.closeAsync.mockRejectedValue(new Error("Close failed"));
    await expect(
      withEncryptedTransaction(f.open, fixtureKey, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(f.connection.execAsync).toHaveBeenCalledWith("ROLLBACK");
    expect(f.connection.closeAsync).toHaveBeenCalledOnce();
  });

  it("não confirma uma transação se o commit falhar", async () => {
    const f = fixture();
    const failure = new Error("Commit failed");
    f.connection.execAsync.mockImplementation(async (sql) => {
      if (sql === "COMMIT") throw failure;
    });
    await expect(
      withEncryptedTransaction(f.open, fixtureKey, async () => "result"),
    ).rejects.toBe(failure);
    expect(f.connection.execAsync).toHaveBeenCalledWith("ROLLBACK");
    expect(f.connection.closeAsync).toHaveBeenCalledOnce();
  });
});
