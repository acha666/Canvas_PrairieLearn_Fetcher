import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { USERSCRIPT } from "./userscript.meta";

function readPkgVersion(): string {
  const pkgPath = fileURLToPath(new URL("./package.json", import.meta.url));
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  return String(pkg.version || "0.0.0");
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/entry/userscript.ts',
      userscript: {
        ...USERSCRIPT,
        version: readPkgVersion(),
      },
    }),
  ],
});
