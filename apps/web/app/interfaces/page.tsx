"use client";

import { useState } from "react";
import Login from "../login/page";
import Management from "../gestao/page";
import Driver from "../motorista/page";
import { InterfacesPreviewContext } from "../../lib/interfaces-preview";

const screens = [
  { id: "gestao", label: "Gestão" },
  { id: "motorista", label: "Motorista" },
  { id: "login", label: "Login" },
] as const;

export default function Interfaces() {
  const [screen, setScreen] =
    useState<(typeof screens)[number]["id"]>("gestao");
  return (
    <InterfacesPreviewContext.Provider value={true}>
      <header
        className="interfaces-toolbar"
        aria-label="Prévia visual do FastTrack"
      >
        <div>
          <strong>Conheça o FastTrack</strong>
          <span>
            Prévia visual sem dados operacionais. O uso real exige login.
          </span>
        </div>
        <nav aria-label="Escolher interface">
          {screens.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              aria-pressed={screen === id}
              onClick={() => setScreen(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <a href="/login">Acessar minha conta →</a>
      </header>
      {screen === "gestao" ? (
        <Management />
      ) : screen === "motorista" ? (
        <Driver />
      ) : (
        <Login />
      )}
    </InterfacesPreviewContext.Provider>
  );
}
