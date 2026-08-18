import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@zenith/shared": path.resolve(__dirname, "../../shared/index.ts"),
    },
  },
  server: {
    port: 1440,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
          lucide: ["lucide-react"],
          recharts: ["recharts"]
        }
      }
    }
  }
});
