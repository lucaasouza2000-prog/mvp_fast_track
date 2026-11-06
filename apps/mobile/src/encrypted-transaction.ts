interface EncryptedConnection {
  execAsync(sql: string): Promise<void>;
  closeAsync(): Promise<void>;
}

function assertKey(key: string) {
  if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error("Chave local inválida.");
}

export async function initializeEncryptedConnection(
  connection: EncryptedConnection,
  key: string,
) {
  assertKey(key);
  await connection.execAsync(
    `PRAGMA key = "x'${key}'"; PRAGMA busy_timeout=10000; SELECT count(*) FROM sqlite_master;`,
  );
}

/** Expo's withExclusiveTransactionAsync creates another connection without
 * applying SQLCipher's key. Open and key our own isolated connection instead. */
export async function withEncryptedTransaction<
  C extends EncryptedConnection,
  T,
>(
  open: () => Promise<C>,
  key: string,
  task: (connection: C) => Promise<T>,
): Promise<T> {
  assertKey(key);
  const connection = await open();
  let began = false;
  let failed = false;
  try {
    await initializeEncryptedConnection(connection, key);
    await connection.execAsync("BEGIN IMMEDIATE");
    began = true;
    const result = await task(connection);
    await connection.execAsync("COMMIT");
    began = false;
    return result;
  } catch (error) {
    failed = true;
    if (began) {
      try {
        await connection.execAsync("ROLLBACK");
      } catch {
        // Preserve the original failure; never replace or delete the database.
      }
    }
    throw error;
  } finally {
    try {
      await connection.closeAsync();
    } catch (error) {
      if (!failed) throw error;
    }
  }
}
