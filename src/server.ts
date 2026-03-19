import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";

const fetch = createStartHandler(defaultStreamHandler);

// Export Workflow classes as named exports
export { SiteAuditWorkflow } from "./server/workflows/SiteAuditWorkflow";

export default {
  fetch,
};
