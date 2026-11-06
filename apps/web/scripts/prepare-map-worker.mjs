import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("maplibre-gl/package.json");
const publicDirectory = new URL("../public/", import.meta.url);
mkdirSync(publicDirectory, { recursive: true });
copyFileSync(
  require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs"),
  new URL(`maplibre-worker-${version}.mjs`, publicDirectory),
);
