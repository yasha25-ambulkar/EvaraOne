import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

function manualChunks(id: string) {
  const normalizedId = id.replace(/\\/g, "/");

  if (!normalizedId.includes("/node_modules/")) {
    return undefined;
  }

  if (normalizedId.includes("/driver.js/")) {
    return "vendor-onboarding";
  }

  if (
    normalizedId.includes("/react/") ||
    normalizedId.includes("/react-dom/") ||
    normalizedId.includes("/react-router-dom/")
  ) {
    return "vendor-react";
  }

  if (normalizedId.includes("/@tanstack/react-query")) {
    return "vendor-query";
  }

  if (
    normalizedId.includes("/firebase/") ||
    normalizedId.includes("/@firebase/")
  ) {
    return "vendor-firebase";
  }

  if (
    normalizedId.includes("/axios/") ||
    normalizedId.includes("/socket.io-client/")
  ) {
    return "vendor-http";
  }

  if (
    normalizedId.includes("/react-hook-form/") ||
    normalizedId.includes("/@hookform/resolvers/") ||
    normalizedId.includes("/zod/")
  ) {
    return "vendor-forms";
  }

  if (
    normalizedId.includes("/framer-motion/") ||
    normalizedId.includes("/lucide-react/") ||
    normalizedId.includes("/clsx/") ||
    normalizedId.includes("/tailwind-merge/") ||
    normalizedId.includes("/sonner/") ||
    normalizedId.includes("/radix-ui/") ||
    normalizedId.includes("/vaul/")
  ) {
    return "vendor-ui";
  }

  if (
    normalizedId.includes("/leaflet/") ||
    normalizedId.includes("/react-leaflet/")
  ) {
    return "vendor-maps";
  }

  if (normalizedId.includes("/recharts/")) {
    return "vendor-charts";
  }

  if (
    normalizedId.includes("/three/") ||
    normalizedId.includes("/@react-three/fiber/") ||
    normalizedId.includes("/@react-three/drei/")
  ) {
    return "vendor-3d";
  }

  return undefined;
}

// https://vite.dev/config/
export default defineConfig({
  envDir: path.resolve(__dirname, "."),
  plugins: [react(), tailwindcss()],
  server: {
    port: 8081,
    strictPort: false,
    host: true,
    proxy: {
      "/api": {
        // Backend runs on PORT 5002 locally (see backend/.env)
        target: "http://localhost:5002",
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: "http://localhost:5002",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks,
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
