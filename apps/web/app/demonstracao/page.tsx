"use client";
import { useState } from "react";
import { DemoProvider, useDemo } from "../../lib/demo";
import Management from "../gestao/page";
import Driver from "../motorista/page";
import Login from "../login/page";
function Presentation() {
  const demo = useDemo()!;
  const [screen, setScreen] = useState("gestao"),
    [notice, setNotice] = useState("");
  const deliveries = demo.state.routes.flatMap((r) => r.deliveries);
  return (
    <>
      <header
        className="interfaces-toolbar demo-toolbar"
        aria-label="Apresentação do FastTrack"
      >
        <div>
          <strong>FastTrack · apresentação</strong>
          <span>
            Dados fictícios. Operações salvas somente neste navegador. GPS e
            trajetos simulados.
          </span>
        </div>
        <nav aria-label="Escolher interface">
          {[
            ["gestao", "Gestão"],
            ["motorista", "Motorista"],
            ["login", "Login"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={screen === id}
              onClick={() => setScreen(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <a href="/login">Entrar na operação real →</a>
      </header>
      <section className="demo-controls">
        <label>
          Motorista do exemplo
          <select
            value={demo.activeDriverId}
            onChange={(e) => demo.selectDriver(e.target.value)}
          >
            {demo.state.drivers.map((d) => (
              <option value={d.id} key={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button
            className="button secondary"
            onClick={() => {
              try {
                demo.simulate();
                setNotice(
                  "Uma posição fictícia foi adicionada ao mapa da rota ativa.",
                );
              } catch (e) {
                setNotice((e as Error).message);
              }
            }}
          >
            Simular posição GPS
          </button>
          <button
            className="text-button"
            onClick={() => {
              demo.reset();
              setNotice("Dados fictícios restaurados.");
            }}
          >
            Reiniciar demonstração
          </button>
          <a className="text-button" href="/configuracao">
            Preparar operação real →
          </a>
        </div>
        <details>
          <summary>Códigos fiscais para testar check-in e check-out</summary>
          <p>
            Selecione Motorista, abra uma rota e informe o código
            correspondente. Nenhum documento tem validade fiscal.
          </p>
          <div className="demo-codes">
            {deliveries.map((d) => (
              <span key={d.id}>
                {d.cargo_code}: <code>{d.fiscal_documents[0]?.code}</code>
              </span>
            ))}
          </div>
        </details>
        {(notice || demo.storageWarning) && (
          <p role="status" className="muted">
            {notice || demo.storageWarning}
          </p>
        )}
      </section>
      {screen === "gestao" ? (
        <Management />
      ) : screen === "motorista" ? (
        <Driver />
      ) : (
        <Login />
      )}
    </>
  );
}
export default function Demo() {
  return (
    <DemoProvider>
      <Presentation />
    </DemoProvider>
  );
}
