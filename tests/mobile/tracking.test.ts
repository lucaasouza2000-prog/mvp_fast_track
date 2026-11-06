import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  secure: new Map<string, string>(),
  task: null as any,
  native: { currentState: "active" },
  permissions: vi.fn(),
  background: vi.fn(),
  services: vi.fn(),
  running: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  position: vi.fn(),
  cached: vi.fn(),
  enqueue: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android", Version: 35 },
  AppState: Object.assign(m.native, { addEventListener: vi.fn() }),
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: "notifications" },
    request: vi.fn(async () => "granted"),
  },
}));
vi.mock("expo-task-manager", () => ({
  defineTask: (_name: string, task: any) => {
    m.task = task;
  },
}));
vi.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  getForegroundPermissionsAsync: m.permissions,
  requestForegroundPermissionsAsync: m.permissions,
  getBackgroundPermissionsAsync: m.background,
  requestBackgroundPermissionsAsync: m.background,
  hasServicesEnabledAsync: m.services,
  hasStartedLocationUpdatesAsync: m.running,
  startLocationUpdatesAsync: m.start,
  stopLocationUpdatesAsync: m.stop,
  getCurrentPositionAsync: m.position,
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => m.secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    m.secure.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    m.secure.delete(key);
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock("../../apps/mobile/src/backend", () => ({
  backend: { auth: { startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn() } },
}));
vi.mock("../../apps/mobile/src/store", () => ({
  cached: m.cached,
  put: vi.fn(),
  enqueue: m.enqueue,
  sync: m.sync,
}));
import {
  captureTrackingPosition,
  stopTracking,
  trackingHealth,
} from "../../apps/mobile/src/tracking";
const active = {
  user: "driver",
  route: "route",
  startedAt: Date.now() - 60000,
};
const fix = (timestamp = Date.now()) => ({
  timestamp,
  coords: { latitude: -23.3, longitude: -51.2, accuracy: 5 },
});
beforeEach(() => {
  vi.clearAllMocks();
  m.secure.clear();
  m.secure.set("fasttrack-active-route", JSON.stringify(active));
  m.native.currentState = "active";
  m.permissions.mockResolvedValue({
    status: "granted",
    android: { accuracy: "fine" },
  });
  m.background.mockResolvedValue({ status: "granted" });
  m.services.mockResolvedValue(true);
  m.running.mockResolvedValue(true);
  m.cached.mockResolvedValue([{ id: "route", status: "ativa" }]);
  m.enqueue.mockResolvedValue(undefined);
  m.sync.mockResolvedValue(undefined);
  m.start.mockResolvedValue(undefined);
  m.position.mockResolvedValue(fix());
});
describe("GPS automático", () => {
  it("captura e envia a posição sem uma ação manual de sincronização", async () => {
    const location = fix();
    m.position.mockResolvedValue(location);
    await captureTrackingPosition("driver");
    expect(m.enqueue).toHaveBeenCalledWith(
      "driver",
      "position",
      expect.objectContaining({
        captured_at: new Date(location.timestamp).toISOString(),
        latitude: -23.3,
      }),
    );
    expect(m.sync).toHaveBeenCalledWith("driver");
    expect(await trackingHealth()).toBe("GPS ativo · localização recente");
  });
  it("registra nova captura mesmo sem deslocamento", async () => {
    const first = Date.now();
    m.position
      .mockResolvedValueOnce(fix(first))
      .mockResolvedValueOnce(fix(first + 15000));
    await captureTrackingPosition("driver");
    await captureTrackingPosition("driver");
    expect(m.enqueue).toHaveBeenCalledTimes(2);
  });
  it("não duplica o mesmo fix entregue pelo serviço e pela captura em primeiro plano", async () => {
    const location = fix();
    m.position.mockResolvedValue(location);
    await captureTrackingPosition("driver");
    await m.task({ data: { locations: [location] } });
    expect(m.enqueue).toHaveBeenCalledTimes(1);
  });
  it("preserva a captura local e tenta o envio seguinte após indisponibilidade de rede", async () => {
    m.sync.mockRejectedValueOnce(new Error("offline"));
    await captureTrackingPosition("driver");
    expect(m.enqueue).toHaveBeenCalledTimes(1);
    expect(await trackingHealth()).toContain(
      "envio será tentado automaticamente",
    );
    await captureTrackingPosition("driver");
    expect(m.sync).toHaveBeenCalledTimes(2);
  });
  it("recupera o serviço interrompido com permissão existente e sem exigir 25 metros", async () => {
    m.running.mockResolvedValue(false);
    await captureTrackingPosition("driver");
    expect(m.start).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        timeInterval: 15000,
        distanceInterval: 0,
        deferredUpdatesInterval: 0,
      }),
    );
  });
  it("respeita pausa, logout, outra conta e aplicativo em segundo plano", async () => {
    await stopTracking();
    await captureTrackingPosition("driver");
    m.secure.set("fasttrack-active-route", JSON.stringify(active));
    await captureTrackingPosition("other");
    m.native.currentState = "background";
    await captureTrackingPosition("driver");
    expect(m.position).not.toHaveBeenCalled();
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it("descarta uma captura pendente se o motorista pausar antes de ela chegar", async () => {
    let release!: (value: unknown) => void;
    m.position.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const request = captureTrackingPosition("driver");
    await vi.waitFor(() => expect(m.position).toHaveBeenCalled());
    await stopTracking();
    release(fix());
    await request;
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it("não muda o horário de uma posição antiga para simular GPS recente", async () => {
    m.position.mockResolvedValue(fix(active.startedAt - 1000));
    await captureTrackingPosition("driver");
    expect(m.enqueue).not.toHaveBeenCalled();
    expect(m.secure.has("tracking-last-capture")).toBe(false);
  });
  it("não inicia captura sem a permissão do motorista", async () => {
    m.background.mockResolvedValue({ status: "denied" });
    await captureTrackingPosition("driver");
    expect(m.position).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });
});
