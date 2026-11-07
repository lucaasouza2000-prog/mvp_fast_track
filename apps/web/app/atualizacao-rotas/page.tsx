"use client";
import { useEffect, useState } from "react";
export default function RouteManagementSetup() {
  const [sql, setSql] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/gestao-rotas.sql", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setSql(await r.text());
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Não foi possível carregar o SQL. Recarregue esta página.");
      });
    return () => controller.abort();
  }, []);
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(base)?.[1];
  return (
    <main className="dashboard">
      <section
        className="deliveries-panel route-manager"
        style={{ maxWidth: 850, margin: "auto" }}
      >
        <h1>Ativar gestão de rotas</h1>
        <p>
          Execute esta atualização uma vez no SQL Editor do Supabase usado pelo
          site. Ela libera a edição e a exclusão de rotas e preserva os dados
          existentes.
        </p>
        <p>
          <strong>Executar este SQL não exclui nenhuma rota.</strong> A limpeza
          será feita depois, escolhendo as rotas no painel.
        </p>
        <ol>
          <li>Copie o SQL abaixo.</li>
          <li>
            Abra o SQL Editor do seu projeto, cole o conteúdo em uma nova
            consulta e clique em Run.
          </li>
          <li>Volte ao painel e abra Gerenciar rotas.</li>
        </ol>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="route-manager-tools">
          <button
            className="button primary"
            disabled={!sql}
            onClick={() =>
              void navigator.clipboard
                .writeText(sql)
                .then(() =>
                  setMessage("SQL copiado. Cole no SQL Editor do Supabase."),
                )
                .catch(() =>
                  setError("Selecione o texto abaixo e copie com Ctrl+C."),
                )
            }
          >
            Copiar SQL
          </button>
          <a
            className="button secondary"
            href={
              ref
                ? `https://supabase.com/dashboard/project/${ref}/sql/new`
                : "https://supabase.com/dashboard"
            }
            target="_blank"
            rel="noreferrer"
          >
            Abrir SQL Editor
          </a>
          <a className="button secondary" href="/gestao">
            Voltar ao painel
          </a>
        </div>
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
        <label>
          SQL de atualização
          <textarea
            aria-label="SQL de atualização"
            readOnly
            value={sql}
            rows={14}
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              width: "100%",
              padding: 16,
              border: "1px solid #c3cfdf",
              borderRadius: 12,
            }}
            onFocus={(e) => e.target.select()}
          />
        </label>
      </section>
    </main>
  );
}
