export const LOCAL_DEMO_ACCOUNTS = {
  superAdmin: {
    email: "superadmin@dgtl.local",
    password: "DemoAdmin123!",
    session: "dgtl-super-admin-v1",
    role: "super_admin",
  },
  client: {
    email: "client@dgtl.local",
    password: "DemoClient123!",
    session: "dgtl-client-v1",
    role: "client",
  },
} as const;

export const LOCAL_DEMO_COOKIE = "dgtl_demo_session";

export type LocalDemoRole =
  (typeof LOCAL_DEMO_ACCOUNTS)[keyof typeof LOCAL_DEMO_ACCOUNTS]["role"];

export function getLocalDemoAccountBySession(session: string | undefined) {
  return Object.values(LOCAL_DEMO_ACCOUNTS).find(
    (account) => account.session === session,
  );
}
