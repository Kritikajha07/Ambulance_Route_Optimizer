import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/Ambulance_Route_Optimizer/",
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart({
  spa: {
    enabled: true,
  },
  }),
    tailwindcss(),
    react(),
  ],
});