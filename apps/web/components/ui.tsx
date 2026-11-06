"use client";
import {
  ArrowUpRight,
  LogOut,
  Route as RouteIcon,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase, configured } from "../lib/supabase";
import type { Profile } from "@fasttrack/core";
import { useInterfacesPreview } from "../lib/interfaces-preview";
import { useDemo } from "../lib/demo";
export function Brand() {
  const demo = useDemo();
  return (
    <a className="brand" href={demo ? "/demonstracao" : "/"}>
      <span className="brand-icon">
        <RouteIcon size={23} />
      </span>
      Fast<span>Track</span>
      <span className="brand-dot">.</span>
    </a>
  );
}
export function Connection() {
  const demo = useDemo();
  const preview = useInterfacesPreview();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <span className={`connection ${online ? "" : "offline"}`}>
      {online ? <Wifi size={14} /> : <WifiOff size={14} />}{" "}
      {demo
        ? "Demonstração local"
        : preview
          ? "Prévia visual"
          : online
            ? "Conectado"
            : "Sem internet"}
    </span>
  );
}
export function Header({
  profile,
  driver = false,
}: {
  profile: Profile | null;
  driver?: boolean;
}) {
  const demo = useDemo();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Brand />
        <nav>
          <span className="nav-active">
            {driver ? "Minhas rotas" : "Visão geral"}
          </span>
          <span className="partner">
            FAST ARIAM <span>×</span> NOSTRA VIA
          </span>
        </nav>
        <div className="account">
          <span className="avatar">
            {profile?.name?.slice(0, 2).toUpperCase() ?? "FT"}
          </span>
          <div>
            <strong>{profile?.name ?? "FastTrack"}</strong>
            <small>{driver ? "Motorista" : "Gestão de operações"}</small>
          </div>
          {profile && !demo && (
            <button
              className="icon-button"
              title="Sair"
              onClick={() => void supabase().auth.signOut()}
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
export function SetupNotice() {
  const preview = useInterfacesPreview();
  return !preview && !configured ? (
    <div className="notice">
      <strong>Conecte sua operação ao Supabase</strong>
      <p>
        Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY,
        aplique a migration e cadastre o primeiro gestor. Nenhum dado de exemplo
        está sendo exibido.
      </p>
      <a href="/login">
        Ir para o acesso <ArrowUpRight size={14} />
      </a>
    </div>
  ) : null;
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = old;
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "modal-wide" : ""}`}
      >
        <header className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            autoFocus
            className="icon-button"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <RouteIcon size={27} />
      </span>
      {children}
    </div>
  );
}
