import {
  newRouteSchema,
  validateOperation,
  type Client,
  type Delivery,
  type NewRoute,
  type Operation,
  type Position,
  type Profile,
  type Route,
  type Vehicle,
} from "./index";

export interface DemoState {
  version: 1;
  manager: Profile;
  drivers: Profile[];
  vehicles: Vehicle[];
  clients: Client[];
  routes: Route[];
  positions: Record<string, Position[]>;
  events: Operation[];
}
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function createDemoState(now = Date.now()): DemoState {
  const ago = (minutes: number) =>
    new Date(now - minutes * 60000).toISOString();
  const drivers: Profile[] = [
    {
      id: id(10),
      tenant_id: id(1),
      name: "Rafael Almeida · exemplo",
      role: "motorista",
      phone: "(00) 00000-0000",
    },
    {
      id: id(11),
      tenant_id: id(1),
      name: "Mariana Costa · exemplo",
      role: "motorista",
      phone: "(00) 00000-0000",
    },
  ];
  const vehicles: Vehicle[] = [
    { id: id(20), plate: "DEMO-01", description: "Caminhão baú · fictício" },
    {
      id: id(21),
      plate: "DEMO-02",
      description: "Caminhão plataforma · fictício",
    },
  ];
  const clients: Client[] = [
    "Mercado Horizonte",
    "Clínica Vale Azul",
    "Hotel Jardim",
    "Indústria Aurora",
    "Centro Comercial Norte",
    "Restaurante Estação",
  ].map((name, n) => ({ id: id(30 + n), name: name + " · exemplo" }));
  const events: Operation[] = [];
  const routes: Route[] = [0, 1, 2].map((index) => {
    const rid = id(100 + index),
      count = index === 0 ? 3 : index === 1 ? 2 : 1;
    const stops = Array.from({ length: count }, (_, n) => ({
      id: id(1000 + index * 10 + n),
      route_id: rid,
      sequence: n + 1,
      address:
        index === 2
          ? "Londrina · endereço fictício"
          : n === 2
            ? "Campo Mourão · endereço fictício"
            : "Maringá · endereço fictício",
      latitude: n === 2 ? -24.045 : -23.421 + n * 0.012,
      longitude: n === 2 ? -52.383 : -51.934 + n * 0.01,
    }));
    const deliveries: Delivery[] = stops.map((stop, n) => {
      const client = clients[index === 0 ? n : index === 1 ? 3 + n : 5],
        did = id(2000 + index * 10 + n);
      const status =
        index === 0
          ? "pendente"
          : index === 1 && n === 1
            ? "em_transporte"
            : "concluida";
      const checked_in_at = status === "pendente" ? null : ago(120),
        checked_out_at = status === "concluida" ? ago(30) : null;
      const code = `NF-DEMO-${String(index * 3 + n + 1).padStart(3, "0")}`;
      if (checked_in_at)
        events.push({
          id: id(5000 + index * 20 + n * 2),
          route_id: rid,
          delivery_id: did,
          kind: "check_in",
          code,
          captured_at: checked_in_at,
        });
      if (checked_out_at)
        events.push({
          id: id(5001 + index * 20 + n * 2),
          route_id: rid,
          delivery_id: did,
          kind: "check_out",
          code,
          captured_at: checked_out_at,
        });
      return {
        id: did,
        route_id: rid,
        stop_id: stop.id,
        client_id: client.id,
        cargo_code: `DEMO-${String(index * 3 + n + 1).padStart(3, "0")}`,
        description:
          [
            "Equipamentos de refrigeração",
            "Expositores comerciais",
            "Peças e acessórios",
          ][n % 3] + " · carga fictícia",
        weight_kg: 150 + n * 80 + index * 50,
        volume_m3: 2.5 + n,
        status,
        checked_in_at,
        checked_out_at,
        clients: client,
        fiscal_documents: [
          { id: id(3000 + index * 10 + n), delivery_id: did, code },
        ],
      };
    });
    const driver = drivers[index === 2 ? 1 : 0];
    return {
      id: rid,
      code: `DEMO-PR-00${index + 1}`,
      driver_id: driver.id,
      vehicle_id: vehicles[index === 2 ? 1 : 0].id,
      origin:
        index === 2
          ? "Maringá · centro de distribuição fictício"
          : "Londrina · centro de distribuição fictício",
      origin_lat: index === 2 ? -23.42 : -23.31,
      origin_lng: index === 2 ? -51.93 : -51.16,
      destination: stops.at(-1)!.address,
      scheduled_at: ago(index === 0 ? -60 : 150),
      status: index === 0 ? "planejada" : index === 1 ? "ativa" : "concluida",
      profiles: driver,
      vehicles: vehicles[index === 2 ? 1 : 0],
      stops,
      deliveries,
    };
  });
  const tracked = routes[1];
  const positions: Position[] = [
    [-23.31, -51.16],
    [-23.34, -51.42],
    [-23.37, -51.65],
  ].map(([latitude, longitude], n) => ({
    id: id(4000 + n),
    route_id: tracked.id,
    driver_id: tracked.driver_id,
    latitude,
    longitude,
    accuracy: 15,
    captured_at: ago(10 - n * 4),
  }));
  return {
    version: 1,
    manager: {
      id: id(2),
      tenant_id: id(1),
      name: "Gestor de demonstração",
      role: "gestor",
      phone: null,
    },
    drivers,
    vehicles,
    clients,
    routes,
    positions: { [tracked.id]: positions },
    events,
  };
}
export function applyDemoOperation(
  state: DemoState,
  driverId: string,
  event: Operation,
): DemoState {
  const route = state.routes.find(
    (r) => r.id === event.route_id && r.driver_id === driverId,
  );
  if (!route)
    throw new Error("Esta rota não está atribuída ao motorista selecionado.");
  const previous = state.events.find((e) => e.id === event.id);
  if (previous) {
    if (JSON.stringify(previous) === JSON.stringify(event)) return state;
    throw new Error("Identificador de evento já utilizado.");
  }
  const delivery = route.deliveries.find((d) => d.id === event.delivery_id);
  if (!delivery) throw new Error("Entrega não pertence à rota.");
  const code = validateOperation(delivery, event.kind, event.code);
  if (
    !Number.isFinite(Date.parse(event.captured_at)) ||
    (event.kind === "check_out" &&
      Date.parse(event.captured_at) < Date.parse(delivery.checked_in_at!))
  )
    throw new Error("Horário da operação inválido.");
  const deliveries = route.deliveries.map((d) =>
    d.id !== delivery.id
      ? d
      : {
          ...d,
          status:
            event.kind === "check_in"
              ? ("em_transporte" as const)
              : ("concluida" as const),
          ...(event.kind === "check_in"
            ? { checked_in_at: event.captured_at }
            : { checked_out_at: event.captured_at }),
        },
  );
  return {
    ...state,
    events: [...state.events, { ...event, code }],
    routes: state.routes.map((r) =>
      r.id !== route.id
        ? r
        : {
            ...r,
            deliveries,
            status: deliveries.every((d) => d.status === "concluida")
              ? "concluida"
              : r.status,
          },
    ),
  };
}
export function addDemoRoute(
  state: DemoState,
  input: NewRoute,
  uuid = () => crypto.randomUUID(),
): DemoState {
  const data = newRouteSchema.parse(input);
  if (state.routes.some((r) => r.code === data.code))
    throw new Error("Esta identificação de rota já existe.");
  const driver = state.drivers.find((d) => d.id === data.driver_id),
    vehicle = state.vehicles.find((v) => v.id === data.vehicle_id);
  if (!driver || !vehicle)
    throw new Error("Selecione um motorista e um veículo cadastrados.");
  const rid = uuid();
  const stops = data.deliveries.map((d, n) => ({
    id: uuid(),
    route_id: rid,
    sequence: n + 1,
    ...d.destination,
  }));
  const deliveries: Delivery[] = data.deliveries.map((d, n) => {
    const client = state.clients.find((c) => c.id === d.client_id);
    if (!client) throw new Error("Cliente não cadastrado.");
    const did = uuid();
    return {
      id: did,
      route_id: rid,
      stop_id: stops[n].id,
      client_id: client.id,
      clients: client,
      cargo_code: d.cargo_code,
      description: d.description,
      weight_kg: d.weight_kg,
      volume_m3: d.volume_m3,
      status: "pendente",
      checked_in_at: null,
      checked_out_at: null,
      fiscal_documents: [{ id: uuid(), delivery_id: did, code: d.fiscal_code }],
    };
  });
  if (new Set(deliveries.map((d) => d.cargo_code)).size !== deliveries.length)
    throw new Error("Os códigos das cargas devem ser distintos na rota.");
  const route: Route = {
    id: rid,
    code: data.code,
    driver_id: driver.id,
    vehicle_id: vehicle.id,
    profiles: driver,
    vehicles: vehicle,
    origin: data.origin.address,
    origin_lat: data.origin.latitude,
    origin_lng: data.origin.longitude,
    destination: stops.at(-1)!.address,
    scheduled_at: data.scheduled_at,
    status: "planejada",
    stops,
    deliveries,
  };
  return { ...state, routes: [route, ...state.routes] };
}
export function simulateDemoPosition(
  state: DemoState,
  now = Date.now(),
): DemoState {
  const route = state.routes.find((r) => r.status === "ativa");
  if (!route)
    throw new Error("Não há rota ativa no exemplo. Reinicie a demonstração.");
  const history = state.positions[route.id] ?? [],
    last = history.at(-1);
  const position: Position = {
    id: crypto.randomUUID(),
    route_id: route.id,
    driver_id: route.driver_id,
    latitude: (last?.latitude ?? route.origin_lat) - 0.003,
    longitude: (last?.longitude ?? route.origin_lng) - 0.008,
    accuracy: 15,
    captured_at: new Date(now).toISOString(),
  };
  return {
    ...state,
    positions: { ...state.positions, [route.id]: [...history, position] },
  };
}
