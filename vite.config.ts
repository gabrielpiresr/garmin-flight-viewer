import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
          return undefined;
        },
      },
    },
  },
});
