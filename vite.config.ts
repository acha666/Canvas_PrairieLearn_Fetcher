import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";
import pkg from "./package.json";
import { USERSCRIPT } from "./userscript.meta";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        ...USERSCRIPT,
        version: String(pkg.version ?? "0.0.0"),
      },
      server: {
        mountGmApi: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
