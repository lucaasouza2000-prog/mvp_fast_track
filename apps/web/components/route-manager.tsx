"use client";
import { useState } from "react";
import { labels } from "@fasttrack/core";
import type { ManagedRoute } from "../lib/route-management";
import { Modal } from "./ui";
export function RouteManager({
  routes,
  onEdit,
  onClose,
  onSaved,
}: {
  routes: ManagedRoute[];
  onEdit: (route: ManagedRoute) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [targets, setTargets] = useState<ManagedRoute[]>([]);
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [confirm, setConfirm] = useState(false),
    [phrase, setPhrase] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [setup, setSetup] = useState(false),
    [message, setMessage] = useState("");
  const visible = routes.filter((r) =>
    [r.code, r.profiles.name, r.destination, r.vehicles.plate]
      .join(" ")
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR").trim()),
  );
  const chosen = routes.filter((r) => selected.includes(r.id));
  async function remove() {
    if (phrase !== "EXCLUIR" || !targets.length || busy) return;
    setBusy(true);
    setError("");
    setSetup(false);
    try {
      const response = await fetch("/api/rotas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routes: targets.map((r) => ({
            id: r.id,
            version: r.management_version ?? 0,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setSetup(!!result.setup);
        throw new Error(result.error);
      }
      setMessage(`${result.count} rota(s) excluída(s) do painel.`);
      setSelected([]);
      setConfirm(false);
      setPhrase("");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Gerenciar rotas"
      subtitle="Edite rotas ou selecione os testes que deseja retirar da operação."
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="route-manager">
        <label>
          Buscar rotas
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busque por rota, motorista, placa ou destino"
            disabled={confirm || busy}
          />
        </label>
        <div className="route-manager-tools">
          <button
            type="button"
            className="button secondary"
            disabled={
              confirm || busy || !visible.length || visible.length > 100
            }
            onClick={() => setSelected(visible.map((r) => r.id))}
          >
            Selecionar rotas filtradas
          </button>
          <button
            type="button"
            className="button secondary danger"
            disabled={!chosen.length || busy || confirm}
            onClick={() => {
              setTargets(chosen);
              setConfirm(true);
              setPhrase("");
              setError("");
            }}
          >
            Excluir selecionadas ({chosen.length})
          </button>
        </div>
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {setup && (
          <p>
            <a href="/atualizacao-rotas" target="_blank" rel="noreferrer">
              Abrir instruções de ativação no Supabase
            </a>
          </p>
        )}
        {confirm ? (
          <section className="route-delete-confirm">
            <h3>Excluir {targets.length} rota(s)?</h3>
            <ul>
              {targets.map((r) => (
                <li key={r.id}>
                  {r.code} · {labels[r.status]}
                </li>
              ))}
            </ul>
            <p>
              As rotas sairão do painel e do aplicativo do motorista. Cadastros
              de clientes, veículos e motoristas serão mantidos. A remoção
              aparece no motorista na próxima sincronização com o aplicativo
              aberto. O histórico fica preservado no banco; registros pendentes
              dessas rotas serão encerrados sem alterar entregas.
            </p>
            <label>
              Digite EXCLUIR para confirmar
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                disabled={busy}
                autoComplete="off"
              />
            </label>
            <div className="route-manager-tools">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Cancelar exclusão
              </button>
              <button
                className="button primary"
                disabled={phrase !== "EXCLUIR" || !targets.length || busy}
                onClick={() => void remove()}
              >
                {busy ? "Excluindo…" : "Confirmar exclusão"}
              </button>
            </div>
          </section>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Selecionar</th>
                  <th>Rota</th>
                  <th>Motorista</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={"Selecionar rota " + r.code}
                        checked={selected.includes(r.id)}
                        onChange={(e) =>
                          setSelected((v) =>
                            e.target.checked
                              ? [...v, r.id]
                              : v.filter((id) => id !== r.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <strong>{r.code}</strong>
                      <small>
                        {r.deliveries.length} entrega(s) · {r.vehicles.plate}
                      </small>
                    </td>
                    <td>{r.profiles.name}</td>
                    <td>
                      <span className={"badge " + r.status}>
                        {labels[r.status]}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        disabled={r.status === "concluida" || busy}
                        onClick={() => onEdit(r)}
                      >
                        Editar rota {r.code}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && <p>Nenhuma rota encontrada.</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
