"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Copy, RefreshCw } from "lucide-react";
import { Brand } from "../../components/ui";
import { managerBootstrapSql } from "@fasttrack/core/bootstrap-manager";
import type { ReadinessReport } from "../../lib/readiness";
const repository = "https://github.com/lucaasouza2000-prog/mvp_fast_track";
export default function Setup() {
  const [report, setReport] = useState<ReadinessReport | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [sql, setSql] = useState(""),
    [copied, setCopied] = useState(false);
  async function check() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/prontidao", { cache: "no-store" });
      if (!response.ok)
        throw new Error("A verificação não respondeu. Tente novamente.");
      setReport(await response.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void check();
  }, []);
  return (
    <>
      <header className="setup-header">
        <Brand />
        <a href="/demonstracao">Apresentação com dados fictícios →</a>
      </header>
      <main className="setup-page">
        <span className="eyebrow">CONFIGURAÇÃO DO FASTTRACK</span>
        <h1>
          Prepare sua operação<span>.</span>
        </h1>
        <p className="subheading">
          Esta página verifica a configuração deste site. Dados preenchidos no
          Codex não são transferidos automaticamente para a Vercel.
        </p>
        <section className="setup-checks">
          <div className="panel-title">
            <div>
              <h2>Conexão com o Supabase</h2>
              <p>
                {report?.backendReady
                  ? "As leituras de conexão passaram. O login e os fluxos operacionais ainda precisam ser testados."
                  : "Conclua os itens pendentes antes de usar dados reais."}
              </p>
            </div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void check()}
            >
              <RefreshCw size={15} className={busy ? "spin" : ""} />
              {busy ? "Verificando…" : "Verificar novamente"}
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {report?.checks.map((c) => (
            <article className="setup-check" key={c.id}>
              {c.state === "ok" ? (
                <CheckCircle2 color="#059669" size={21} />
              ) : (
                <CircleAlert
                  color={c.state === "error" ? "#ba3b43" : "#b08739"}
                  size={21}
                />
              )}
              <div>
                <strong>{c.title}</strong>
                <p>{c.message}</p>
              </div>
              <span
                className={`badge ${c.state === "ok" ? "concluida" : "pendente"}`}
              >
                {c.state === "ok"
                  ? "Verificado"
                  : c.state === "error"
                    ? "Verificar"
                    : c.state === "unverified"
                      ? "Não verificado"
                      : "Pendente"}
              </span>
            </article>
          ))}
          {!report && !error && (
            <p className="loading">Consultando a configuração do servidor…</p>
          )}
          <p className="muted setup-footnote">
            A verificação usa somente leituras, pode levar alguns segundos e
            conserva o resultado por 30 s. Não testa GPS, envio de e-mail,
            Realtime ou isolamento entre contas.
          </p>
        </section>
        <section className="setup-instructions">
          <h2>1. Configure as variáveis na Vercel</h2>
          <p>
            Abra{" "}
            <a
              href="https://vercel.com/lucas-c223/mvp_fast_track/settings"
              target="_blank"
              rel="noreferrer"
            >
              as configurações do projeto
            </a>{" "}
            → Environment Variables. Preencha{" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> com a URL base do Supabase,{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> com a chave pública e{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code> com a chave secreta apenas no
            servidor. Depois faça um novo deploy.
          </p>
          <p className="muted">
            Não publique chaves secretas no chat, no GitHub ou em variáveis
            NEXT_PUBLIC_/EXPO_PUBLIC_. O aplicativo Android recebe somente a URL
            e a chave pública do mesmo projeto.
          </p>
          <h2>2. Prepare o banco</h2>
          <p>
            No painel do Supabase, abra SQL Editor e execute a{" "}
            <a
              href={`${repository}/blob/main/supabase/migrations/202611050001_fasttrack.sql`}
              target="_blank"
              rel="noreferrer"
            >
              migration do FastTrack
            </a>{" "}
            em um banco novo. Se as tabelas já existem, confira o status acima
            antes de executar novamente. Desative novos cadastros públicos em
            Authentication.
          </p>
          <h2>3. Crie seu primeiro acesso de gestor</h2>
          <p>
            No Supabase, abra Authentication → Users → Add user. Crie seu
            usuário com e-mail confirmado e uma senha forte, sem compartilhar a
            senha aqui. Depois preencha somente nome e e-mail abaixo para gerar
            o SQL que vincula essa conta ao FastTrack. Execute esse SQL no SQL
            Editor como proprietário do banco.
          </p>
          <form
            className="setup-bootstrap"
            onSubmit={(e) => {
              e.preventDefault();
              setCopied(false);
              try {
                setSql(managerBootstrapSql(email, name));
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <div className="form-grid">
              <label>
                Nome do gestor
                <input
                  value={name}
                  required
                  minLength={3}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
              <label>
                E-mail criado no Supabase
                <input
                  value={email}
                  required
                  type="email"
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
            </div>
            <button className="button secondary">
              Gerar SQL de vinculação
            </button>
          </form>
          {sql && (
            <div className="setup-sql">
              <p className="muted">
                O SQL só funciona no editor administrativo. Uma conta
                autenticada comum não pode usá-lo para alterar o próprio papel.
                Repetir para o mesmo gestor não duplica a empresa.
              </p>
              <textarea
                readOnly
                aria-label="SQL de vinculação do gestor"
                value={sql}
              />
              <button
                className="button secondary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(sql)
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError("Selecione e copie o SQL manualmente."),
                    )
                }
              >
                <Copy size={15} />
                {copied ? "Copiado" : "Copiar SQL"}
              </button>
            </div>
          )}
          <h2>4. Valide a operação antes de sair para entrega</h2>
          <p>
            Entre com o gestor, cadastre motorista, veículo e cliente, e crie
            uma rota. Faça check-in/check-out com uma conta de motorista e
            confira os eventos. Valide também que outra conta não acessa a rota.
          </p>
          <p>
            O APK Android ainda precisa ser compilado, instalado e testado em um
            aparelho físico para câmera, armazenamento offline e localização com
            tela bloqueada. O bundle JavaScript e esta página não comprovam
            essas capacidades.
          </p>
          <div className="setup-actions">
            <a className="button primary" href="/login">
              Entrar no FastTrack
            </a>
            <a className="button secondary" href="/demonstracao">
              Apresentar dados fictícios
            </a>
            <a
              href={`${repository}/blob/main/docs/ACEITACAO.md`}
              target="_blank"
              rel="noreferrer"
            >
              Roteiro completo de aceitação →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
