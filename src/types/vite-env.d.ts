/// <reference types="vite/client" />
declare module "virtual:openseo-mcp-widget" {
  const html: string;
  export default html;
}
interface ViteTypeOptions {
  // By adding this line, you can make the type of ImportMetaEnv strict
  // to disallow unknown keys.
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_SHOW_DEVTOOLS?: string;
  readonly BYPASS_EMAIL_VERIFICATION?: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
