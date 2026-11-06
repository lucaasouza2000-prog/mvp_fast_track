"use client";
import { useState } from "react";
import { ArrowRight, ShieldCheck, Truck } from "lucide-react";
import { Brand } from "../../components/ui";
import { configured, supabase } from "../../lib/supabase";
import { useInterfacesPreview } from "../../lib/interfaces-preview";
export default function Login() {
  const preview = useInterfacesPreview();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return;
    setBusy(true);
    setError("");
    try {
      const db = supabase();
      const { data, error: e } = await db.auth.signInWithPassword({
        email,
        password,
      });
      if (e) throw e;
      const { data: p, error: pe } = await db
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      if (pe || !p)
        throw new Error(
          "Perfil não cadastrado. Entre em contato com seu gestor.",
        );
      window.location.assign(p.role === "gestor" ? "/gestao" : "/motorista");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">FAST ARIAM + NOSTRA VIA</span>
          <h1>
            Sua operação.
            <br />
            No caminho certo.
          </h1>
          <p>
            Da coleta à entrega, visibilidade para quem gerencia e simplicidade
            para quem está na estrada.
          </p>
          <div className="login-route">
            <span />
            <div />
            <Truck size={38} />
            <div />
            <span />
          </div>
        </div>
        <small>Conectando pessoas, cargas e destinos.</small>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <span className="eyebrow">BEM-VINDO AO FASTTRACK</span>
          <h2>Vamos começar?</h2>
          <p>Acesse sua conta para acompanhar as entregas.</p>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com.br"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              minLength={8}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
            />
          </label>
          {!preview && !configured && (
            <p className="error">
              O backend ainda não foi configurado. Consulte o README para
              conectar seu projeto Supabase.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary full"
            disabled={preview || !configured || busy}
          >
            {busy ? "Entrando…" : "Entrar na plataforma"}
            <ArrowRight size={18} />
          </button>
          <small className="secure">
            <ShieldCheck size={16} /> Acesso seguro à sua operação
          </small>
          {!preview && (
            <div className="login-links">
              <a className="interfaces-link" href="/demonstracao">
                Apresentação com dados fictícios
              </a>
              <a className="interfaces-link" href="/configuracao">
                Verificar configuração da operação
              </a>
              <a className="interfaces-link" href="/interfaces">
                Visualizar as interfaces vazias
              </a>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
