import { Autumn } from "autumn-js";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

export const autumn = new Autumn({
  secretKey: () => getRequiredEnvValue("AUTUMN_SECRET_KEY"),
});
