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
export type ActiveTracking = { user: string; route: string; startedAt: number };
export async function activeTracking(): Promise<ActiveTracking | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw ? JSON.parse(raw) : null;
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
    const routes = await cached<Route[]>(active.user, "routes");
    if (!routes?.some((r) => r.id === active.route && r.status === "ativa")) {
      await stopTracking();
      return;
    }
    for (const location of locations) {
      // Android may deliver a cached fix from before service activation.
      if (location.timestamp < active.startedAt) continue;
      await enqueue(active.user, "position", {
        id: Crypto.randomUUID(),
        route_id: active.route,
        driver_id: active.user,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        captured_at: new Date(location.timestamp).toISOString(),
      });
      await SecureStore.setItemAsync(
        "tracking-last-capture",
        String(location.timestamp),
      );
    }
    await SecureStore.deleteItemAsync("tracking-error");
    await sync(active.user);
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
    routes.map((r) => (r.id === route ? { ...r, status: "ativa" } : r)),
  );
  await SecureStore.deleteItemAsync("tracking-last-capture");
  await SecureStore.setItemAsync(
    KEY,
    JSON.stringify({ user, route, startedAt }),
  );
  try {
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 60_000,
      distanceInterval: 25,
      deferredUpdatesInterval: 60_000,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: "FastTrack · rota ativa",
        notificationBody: "Localização em uso para acompanhar suas entregas.",
        notificationColor: "#2563eb",
        killServiceOnDestroy: false,
      },
      showsBackgroundLocationIndicator: true,
    });
    await SecureStore.deleteItemAsync("tracking-error");
  } catch (e) {
    await SecureStore.deleteItemAsync(KEY);
    throw e;
  }
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
