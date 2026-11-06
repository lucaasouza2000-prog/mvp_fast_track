"use client";
import { getVersion, setWorkerUrl } from "maplibre-gl";

// Serve the matching worker intact: bundling changes import.meta.url in Next.js.
setWorkerUrl(`/maplibre-worker-${getVersion()}.mjs`);
export * from "maplibre-gl";
