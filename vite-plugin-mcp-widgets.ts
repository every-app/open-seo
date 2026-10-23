import { build, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const moduleId = "virtual:openseo-mcp-widget";
const resolvedId = `\0${moduleId}`;

// A separate browser bundle keeps React and the app's actual UI components out
// of the Worker runtime. The MCP resource serves the bundle and CSS inline, so
// the sandbox needs no network access, session cookies, or asset allowlist.
export function mcpWidgets(): Plugin {
  return {
    name: "openseo-mcp-widgets",
    resolveId(id) {
      if (id === moduleId) return resolvedId;
    },
    async load(id) {
      if (id !== resolvedId) return;
      const { html, files } = await buildWidget();
      for (const file of files) this.addWatchFile(file);
      return `export default ${JSON.stringify(html)}`;
    },
  };
}

async function buildWidget() {
  const result = await build({
    configFile: false,
    publicDir: false,
    logLevel: "warn",
    resolve: { tsconfigPaths: true },
    plugins: [react(), tailwindcss()],
    // The enclosing dev server sets NODE_ENV=development. Keep this inline
    // build's JSX runtime consistent with its bundled production React.
    oxc: { jsx: { development: false } },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      cssCodeSplit: false,
      lib: {
        entry: "src/client/mcp-widgets/main.tsx",
        formats: ["iife"],
        name: "OpenSeoWidgets",
      },
    },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((item) =>
    "output" in item ? item.output : [],
  );
  const script = output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
  const css = output
    .flatMap((item) =>
      item.type === "asset" && item.fileName.endsWith(".css")
        ? [String(item.source)]
        : [],
    )
    .join("\n");
  if (!script || !css)
    throw new Error("MCP widget build produced no JS or CSS");
  return {
    files: output.flatMap((item) =>
      item.type === "chunk"
        ? item.moduleIds.filter(
            (id) => !id.startsWith("\0") && !id.includes("node_modules"),
          )
        : [],
    ),
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenSEO</title><style>${css.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`,
  };
}
