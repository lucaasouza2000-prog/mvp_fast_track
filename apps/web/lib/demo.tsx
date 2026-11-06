"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  addDemoRoute,
  applyDemoOperation,
  createDemoState,
  simulateDemoPosition,
  type DemoState,
} from "@fasttrack/core/demo";
import { type NewRoute, type Operation, type Profile } from "@fasttrack/core";
import { InterfacesPreviewContext } from "./interfaces-preview";
const STORAGE = "fasttrack-presentation-v1";
interface DemoContextValue {
  state: DemoState;
  activeDriverId: string;
  selectDriver: (id: string) => void;
  reset: () => void;
  operation: (event: Operation) => void;
  createRoute: (data: NewRoute) => void;
  addDriver: (name: string, phone: string) => void;
  addVehicle: (plate: string, description: string) => void;
  addClient: (name: string) => void;
  simulate: () => void;
  storageWarning: string;
}
const DemoContext = createContext<DemoContextValue | null>(null);
export function useDemo() {
  return useContext(DemoContext);
}
export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DemoState | null>(null),
    [activeDriverId, setDriver] = useState(""),
    [storageWarning, setWarning] = useState("");
  useEffect(() => {
    let initial = createDemoState();
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const saved = JSON.parse(raw);
        if (
          saved.version === 1 &&
          Array.isArray(saved.routes) &&
          Array.isArray(saved.events) &&
          Array.isArray(saved.drivers) &&
          saved.drivers.length &&
          Array.isArray(saved.clients) &&
          Array.isArray(saved.vehicles) &&
          saved.manager &&
          saved.positions
        )
          initial = saved;
      }
    } catch {
      setWarning(
        "O armazenamento do navegador está indisponível. O exemplo funcionará apenas nesta sessão.",
      );
    }
    setState(initial);
    setDriver(initial.drivers[0].id);
  }, []);
  useEffect(() => {
    if (state)
      try {
        localStorage.setItem(STORAGE, JSON.stringify(state));
      } catch {
        setWarning(
          "Não foi possível salvar o exemplo neste navegador. As alterações permanecem apenas nesta sessão.",
        );
      }
  }, [state]);
  const value = useMemo<DemoContextValue | null>(
    () =>
      state
        ? {
            state,
            activeDriverId,
            storageWarning,
            selectDriver: setDriver,
            reset() {
              const initial = createDemoState();
              setState(initial);
              setDriver(initial.drivers[0].id);
            },
            operation(event) {
              setState(applyDemoOperation(state, activeDriverId, event));
            },
            createRoute(data) {
              setState(addDemoRoute(state, data));
            },
            addDriver(name, phone) {
              const driver: Profile = {
                id: crypto.randomUUID(),
                tenant_id: state.manager.tenant_id,
                name,
                phone,
                role: "motorista",
              };
              setState({ ...state, drivers: [...state.drivers, driver] });
            },
            addVehicle(plate, description) {
              if (state.vehicles.some((v) => v.plate === plate.toUpperCase()))
                throw new Error("Placa já cadastrada no exemplo.");
              setState({
                ...state,
                vehicles: [
                  ...state.vehicles,
                  {
                    id: crypto.randomUUID(),
                    plate: plate.toUpperCase(),
                    description,
                  },
                ],
              });
            },
            addClient(name) {
              setState({
                ...state,
                clients: [...state.clients, { id: crypto.randomUUID(), name }],
              });
            },
            simulate() {
              setState(simulateDemoPosition(state));
            },
          }
        : null,
    [state, activeDriverId, storageWarning],
  );
  if (!value)
    return <main className="loading">Preparando a demonstração…</main>;
  return (
    <InterfacesPreviewContext.Provider value={true}>
      <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
    </InterfacesPreviewContext.Provider>
  );
}
