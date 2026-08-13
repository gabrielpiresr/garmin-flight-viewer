import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { geoaiswebWmsDevPlugin } from "./vite.geoaisweb-wms-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), geoaiswebWmsDevPlugin()],
  server: {
    proxy: {
      // GeoAISWEB WFS/WMS has no CORS — proxy for local flight-plan tools.
      "/geoaisweb-proxy": {
        target: "https://geoaisweb.decea.mil.br",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/geoaisweb-proxy/, ""),
      },
      "/esri-proxy": {
        target: "https://services.arcgisonline.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/esri-proxy/, ""),
      },
      "/esri-imagery-proxy": {
        target: "https://server.arcgisonline.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/esri-imagery-proxy/, ""),
      },
      "/terrain-proxy": {
        target: "https://s3.amazonaws.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/terrain-proxy/, "/elevation-tiles-prod/terrarium"),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (!normalizedId.includes("/node_modules/")) return;
          if (normalizedId.includes("/node_modules/leaflet/") || normalizedId.includes("/node_modules/react-leaflet/")) return "leaflet";
          if (normalizedId.includes("/node_modules/react/") || normalizedId.includes("/node_modules/react-dom/")) return "react";
          if (normalizedId.includes("/node_modules/appwrite/")) return "appwrite";
          if (normalizedId.includes("/node_modules/recharts/") || normalizedId.includes("/node_modules/d3-")) return "charts";
          if (normalizedId.includes("/node_modules/@tiptap/") || normalizedId.includes("/node_modules/prosemirror")) return "editor";
          if (normalizedId.includes("/node_modules/papaparse/")) return "csv";
          if (
            normalizedId.includes("/node_modules/three/") ||
            normalizedId.includes("/node_modules/@react-three/") ||
            normalizedId.includes("/node_modules/three-stdlib/")
          ) {
            return "three";
          }
          return undefined;
        },
      },
    },
  },
});
