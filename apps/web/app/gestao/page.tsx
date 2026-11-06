"use client";
import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  CircleCheck,
  Clock3,
  Package,
  Plus,
  RefreshCw,
  Search,
  Truck,
} from "lucide-react";
import { labels, type Route, type Delivery } from "@fasttrack/core";
import { Header, SetupNotice, Empty } from "../../components/ui";
import { useWorkspace } from "../../lib/use-workspace";
import { Admin } from "../../components/admin";
import { DeliveryDetail } from "../../components/delivery-detail";
import { useDemo } from "../../lib/demo";
export default function Management() {
  const demo = useDemo();
  const { profile, routes, loading, error, reload } = useWorkspace("gestor");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("todas"),
    [admin, setAdmin] = useState(false),
    [selected, setSelected] = useState<{
      route: Route;
      delivery: Delivery;
    } | null>(null);
  const all = useMemo(
    () =>
      routes.flatMap((route) =>
        route.deliveries.map((delivery) => ({ route, delivery })),
      ),
    [routes],
  );
  const results = all.filter(
    ({ route, delivery: d }) =>
      (filter === "todas" || d.status === filter) &&
      [
        route.code,
        d.clients.name,
        d.cargo_code,
        ...d.fiscal_documents.map((f) => f.code),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR").trim()),
  );
  const current =
    selected && all.find((x) => x.delivery.id === selected.delivery.id);
  return (
    <>
      <Header profile={profile} />
      <main className="dashboard management-dashboard">
        <div className="page-intro">
          <div>
            <span className="eyebrow">CENTRAL DE OPERAÇÕES</span>
            <h1>
              Acompanhe suas entregas<span>.</span>
            </h1>
          </div>
          <button
            className="button primary"
            disabled={!profile}
            onClick={() => setAdmin(true)}
          >
            <Plus size={18} />
            Nova rota
          </button>
        </div>
        <SetupNotice />
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button className="text-button" onClick={() => void reload()}>
              Tentar novamente
            </button>
          </div>
        )}
        <section className="stats" aria-label="Resumo da operação">
          {[
            {
              name: "Total de entregas",
              count: all.length,
              icon: Package,
              foot: "Toda a sua operação",
              color: "blue",
            },
            {
              name: "Em transporte",
              count: all.filter((x) => x.delivery.status === "em_transporte")
                .length,
              icon: Truck,
              foot: "A caminho do destino",
              color: "blue",
            },
            {
              name: "Concluídas",
              count: all.filter((x) => x.delivery.status === "concluida")
                .length,
              icon: CircleCheck,
              foot: "Entregas confirmadas",
              color: "green",
            },
            {
              name: "Aguardando coleta",
              count: all.filter((x) => x.delivery.status === "pendente").length,
              icon: Clock3,
              foot: "Prontas para o próximo passo",
              color: "amber",
            },
          ].map((s) => (
            <article className="stat" key={s.name}>
              <div>
                <span>{s.name}</span>
                <s.icon size={19} />
              </div>
              <strong>
                {loading ? "—" : String(s.count).padStart(2, "0")}
              </strong>
              <small>
                <i className={`dot ${s.color}`} />
                {s.foot}
              </small>
            </article>
          ))}
        </section>
        <section className="deliveries-panel">
          <div className="panel-title">
            <div>
              <h2>
                Entregas <span className="count">{all.length}</span>
              </h2>
              <p>Encontre uma carga e acompanhe o que acontece no caminho.</p>
            </div>
            <button
              className="icon-button"
              title="Atualizar"
              onClick={() => void reload()}
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
          </div>
          <div className="search-row">
            <div className="search-input">
              <Search size={19} />
              <input
                aria-label="Pesquisar entregas"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Busque por cliente, nota fiscal, carga ou rota…"
              />
            </div>
            <button
              className="button search-submit"
              onClick={() => setQuery(query.trim())}
            >
              Buscar
            </button>
          </div>
          <div className="filters">
            {[
              ["todas", "Todas"],
              ["em_transporte", "Em transporte"],
              ["pendente", "Aguardando coleta"],
              ["concluida", "Concluídas"],
            ].map(([v, l]) => (
              <button
                className={filter === v ? "active" : ""}
                key={v}
                onClick={() => setFilter(v)}
              >
                {l}
                <span>
                  {v === "todas"
                    ? all.length
                    : all.filter((x) => x.delivery.status === v).length}
                </span>
              </button>
            ))}
          </div>
          {loading ? (
            <div className="loading">Carregando sua operação…</div>
          ) : results.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>CLIENTE / CARGA</th>
                    <th>ROTA / DESTINO</th>
                    <th>MOTORISTA</th>
                    <th>STATUS</th>
                    <th aria-label="Detalhes" />
                  </tr>
                </thead>
                <tbody>
                  {results.map(({ route, delivery: d }) => (
                    <tr
                      key={d.id}
                      onClick={() => setSelected({ route, delivery: d })}
                    >
                      <td>
                        <button
                          className="row-link"
                          onClick={() => setSelected({ route, delivery: d })}
                        >
                          {d.clients.name}
                        </button>
                        <small>
                          {d.cargo_code} · {d.weight_kg} kg
                        </small>
                      </td>
                      <td>
                        <strong>{route.code}</strong>
                        <small>
                          {route.stops.find((s) => s.id === d.stop_id)?.address}
                        </small>
                      </td>
                      <td>
                        <strong>{route.profiles.name}</strong>
                        <small>
                          <span className="vehicle-plate">
                            {route.vehicles.plate}
                          </span>
                        </small>
                      </td>
                      <td>
                        <span className={`badge ${d.status}`}>
                          <i />
                          {labels[d.status]}
                        </span>
                      </td>
                      <td>
                        <ChevronRight size={17} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>
              <h3>
                {query || filter !== "todas"
                  ? "Nenhuma entrega encontrada"
                  : "Tudo pronto para a primeira rota"}
              </h3>
              <p>
                {query || filter !== "todas"
                  ? "Tente outro termo ou altere o filtro."
                  : "Cadastre um motorista, um veículo e seus clientes. Depois, crie uma rota para começar."}
              </p>
              <button
                className="text-button"
                disabled={!profile}
                onClick={() => setAdmin(true)}
              >
                Cadastrar operação <ArrowUpRight size={16} />
              </button>
            </Empty>
          )}
          <footer className="panel-footer">
            <span>
              {results.length} {results.length === 1 ? "entrega" : "entregas"}
              {query ? " encontradas" : " na visualização"}
            </span>
            <span>
              <i className="dot green" />{" "}
              {demo
                ? "Dados fictícios · alterações locais"
                : "Atualização automática a cada 30 s"}
            </span>
          </footer>
        </section>
        <footer className="page-footer">
          <span>
            FastTrack <span>·</span> Logística que conecta.
          </span>
          <span>Fast Ariam Equipamentos & Nostra Via</span>
        </footer>
      </main>
      {admin && profile && (
        <Admin
          profile={profile}
          onClose={() => setAdmin(false)}
          onSaved={() => void reload()}
        />
      )}
      {selected && (current ?? selected) && (
        <DeliveryDetail
          {...(current ?? selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
