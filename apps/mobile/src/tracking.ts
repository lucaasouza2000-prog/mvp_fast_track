import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { AppState, PermissionsAndroid, Platform } from "react-native";
import { backend } from "./backend";
import { cached, put, enqueue, sync } from "./store";
import type { Route } from "@fasttrack/core";
const TASK = "fasttrack-location-v1",
  KEY = "fasttrack-active-route";
export const LOCATION_INTERVAL_MS = 15000;
export type ActiveTracking = { user: string; route: string; startedAt: number };
export async function activeTracking(): Promise<ActiveTracking | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw ? JSON.parse(raw) : null;
}
function locationOptions(): Location.LocationTaskOptions {
  return {
    accuracy: Location.Accuracy.High,
    timeInterval: LOCATION_INTERVAL_MS,
    distanceInterval: 0,
    deferredUpdatesInterval: 0,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: "FAST TRACK · GPS automático",
      notificationBody: "Enviando sua localização durante a rota ativa.",
      notificationColor: "#2563eb",
      killServiceOnDestroy: false,
    },
    showsBackgroundLocationIndicator: true,
  };
}
let savingLocations: Promise<void> = Promise.resolve();
async function recordLocations(
  active: ActiveTracking,
  locations: Location.LocationObject[],
) {
  const saving = savingLocations.then(async () => {
    const current = await activeTracking();
    if (current?.user !== active.user || current.route !== active.route) return;
    const routes = await cached<Route[]>(active.user, "routes");
    if (!routes?.some((r) => r.id === active.route && r.status === "ativa")) {
      await stopTracking();
      return;
    }
    let last =
      Number(await SecureStore.getItemAsync("tracking-last-capture")) || 0;
    let lastFix = await SecureStore.getItemAsync("tracking-last-fix");
    for (const location of [...locations].sort(
      (a, b) => a.timestamp - b.timestamp,
    )) {
      // Keep device capture times. Never turn an old cached fix into a fresh one.
      if (
        !Number.isFinite(location.timestamp) ||
        location.timestamp < active.startedAt
      )
        continue;
      const fix = JSON.stringify([
        active.user,
        active.route,
        location.timestamp,
        location.coords.latitude,
        location.coords.longitude,
      ]);
      if (fix === lastFix) continue;
      await enqueue(active.user, "position", {
        id: Crypto.randomUUID(),
        route_id: active.route,
        driver_id: active.user,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        captured_at: new Date(location.timestamp).toISOString(),
      });
      lastFix = fix;
      last = Math.max(last, location.timestamp);
      await SecureStore.setItemAsync("tracking-last-fix", fix);
      await SecureStore.setItemAsync("tracking-last-capture", String(last));
    }
    await SecureStore.deleteItemAsync("tracking-error");
  });
  savingLocations = saving.catch(() => {});
  await saving;
  const current = await activeTracking();
  if (current?.user !== active.user || current.route !== active.route) return;
  try {
    await sync(active.user);
  } catch {
    await SecureStore.setItemAsync(
      "tracking-error",
      "GPS salvo no aparelho. O envio será tentado automaticamente.",
    );
  }
}
let capturing: Promise<void> | null = null;
/** Foreground heartbeat, also recovering an interrupted service with prior permission.
 * A manual pause removes KEY, so this never restarts a paused route. */
export async function captureTrackingPosition(user: string): Promise<void> {
  if (Platform.OS !== "android" || AppState.currentState !== "active") return;
  if (capturing) return capturing;
  capturing = (async () => {
    const active = await activeTracking();
    if (!active || active.user !== user) return;
    if (!(await Location.hasServicesEnabledAsync())) return;
    const permission = await Location.getForegroundPermissionsAsync();
    if (
      permission.status !== "granted" ||
      permission.android?.accuracy === "coarse" ||
      (await Location.getBackgroundPermissionsAsync()).status !== "granted"
    )
      return;
    if (!(await Location.hasStartedLocationUpdatesAsync(TASK))) {
      const current = await activeTracking();
      if (current?.user !== user || current.route !== active.route) return;
      await Location.startLocationUpdatesAsync(TASK, locationOptions());
    }
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: false,
    });
    await recordLocations(active, [location]);
  })();
  try {
    await capturing;
  } catch {
    await SecureStore.setItemAsync(
      "tracking-error",
      "Aguardando uma nova captura GPS. O aplicativo tentará novamente automaticamente.",
    );
  } finally {
    capturing = null;
  }
}
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error) {
    await SecureStore.setItemAsync(
      "tracking-error",
      "Serviço de rastreamento interrompido. Abra o aplicativo.",
    );
    return;
  }
  const active = await activeTracking();
  if (!active || !data) return;
  const locations = (data as { locations: Location.LocationObject[] })
    .locations;
  try {
    await recordLocations(active, locations);
  } catch {
    await SecureStore.setItemAsync(
      "tracking-error",
      "Falha ao gravar ou sincronizar GPS. Abra o aplicativo; algumas capturas podem não ter sido salvas.",
    );
  }
});
export async function startTracking(user: string, route: string) {
  if (Platform.OS !== "android")
    throw new Error(
      "Rastreamento deste MVP preparado para Android. iOS ainda exige validação.",
    );
  const current = await activeTracking();
  if (current && (current.user !== user || current.route !== route))
    throw new Error("Encerre o rastreamento da outra rota primeiro.");
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error("GPS desativado. Ative a localização do aparelho.");
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (
    foreground.status !== "granted" ||
    foreground.android?.accuracy === "coarse"
  )
    throw new Error("Permita localização precisa para rastrear.");
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted")
    throw new Error(
      "Sem permissão em segundo plano. Selecione “Permitir o tempo todo” nas configurações.",
    );
  if (Number(Platform.Version) >= 33) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (granted !== "granted")
      throw new Error(
        "Permita notificações para visualizar o serviço de rastreamento.",
      );
  }
  const { error } = await backend.rpc("start_route", { p_route_id: route });
  if (error) throw new Error(error.message);
  const result = await backend
    .from("routes")
    .select("started_at")
    .eq("id", route)
    .single();
  if (result.error || !result.data?.started_at)
    throw new Error(
      "Não foi possível confirmar o início da rota. Tente retomar o GPS.",
    );
  const startedAt = Date.parse(result.data.started_at);
  const routes = await cached<Route[]>(user, "routes");
  if (!routes?.some((r) => r.id === route))
    throw new Error("Sincronize a rota antes de iniciar o GPS.");
  await put(
    user,
    "routes",
    routes.map((r) =>
      r.id === route
        ? { ...r, status: "ativa", started_at: result.data.started_at }
        : r,
    ),
  );
  await SecureStore.deleteItemAsync("tracking-last-capture");
  await SecureStore.deleteItemAsync("tracking-last-fix");
  await SecureStore.setItemAsync(
    KEY,
    JSON.stringify({ user, route, startedAt }),
  );
  try {
    await Location.startLocationUpdatesAsync(TASK, locationOptions());
    await SecureStore.deleteItemAsync("tracking-error");
  } catch (e) {
    await SecureStore.deleteItemAsync(KEY);
    throw e;
  }
  void captureTrackingPosition(user).catch(() => {});
}
export async function stopTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK))
    await Location.stopLocationUpdatesAsync(TASK);
  await SecureStore.deleteItemAsync(KEY);
}
export async function trackingHealth() {
  const active = await activeTracking();
  if (!active) return "Rastreamento não iniciado";
  if (!(await Location.hasServicesEnabledAsync())) return "GPS desativado";
  if ((await Location.getBackgroundPermissionsAsync()).status !== "granted")
    return "Sem permissão em segundo plano";
  if (!(await Location.hasStartedLocationUpdatesAsync(TASK)))
    return "Serviço de rastreamento interrompido";
  const error = await SecureStore.getItemAsync("tracking-error");
  if (error) return error;
  const last = Number(await SecureStore.getItemAsync("tracking-last-capture"));
  return last && Date.now() - last < 180000
    ? "GPS ativo · localização recente"
    : "Localização desatualizada · aguardando captura GPS";
}
AppState.addEventListener("change", (state) => {
  if (state === "active") backend.auth.startAutoRefresh();
  else backend.auth.stopAutoRefresh();
});
