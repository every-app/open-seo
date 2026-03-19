import { isHostedAuthMode } from "@/lib/auth-mode";

let workersEnvPromise: Promise<Record<string, unknown> | null> | null = null;

async function getEnvValue(name: string): Promise<string | undefined> {
  const processValue =
    typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (processValue) {
    return processValue;
  }

  const workersEnv = await getWorkersEnv();
  const workerValue = workersEnv?.[name];
  return typeof workerValue === "string" ? workerValue : undefined;
}

export async function getRequiredEnvValue(name: string): Promise<string> {
  const value = await getEnvValue(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function isHostedServerAuthMode(): Promise<boolean> {
  return isHostedAuthMode(await getEnvValue("AUTH_MODE"));
}

export async function getWorkersBinding(name: string): Promise<unknown> {
  const workersEnv = await getWorkersEnv();
  const binding = workersEnv?.[name];
  if (!binding) {
    throw new Error(`Missing required Worker binding: ${name}`);
  }
  return binding;
}

async function getWorkersEnv(): Promise<Record<string, unknown> | null> {
  if (!workersEnvPromise) {
    workersEnvPromise = loadWorkersEnv();
  }
  return workersEnvPromise;
}

async function loadWorkersEnv(): Promise<Record<string, unknown> | null> {
  try {
    const workersModule = await import("cloudflare:workers");
    return isRecord(workersModule.env) ? workersModule.env : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
