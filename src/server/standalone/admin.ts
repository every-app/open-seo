import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member, organization, user } from "@/db/schema";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { usesBetterAuthServer } from "@/server/lib/runtime-env";
import { isOperatorRequest } from "./operator-auth";

const commandSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("claim-legacy-user"),
    userId: z.string().min(1),
    organizationId: z.string().min(1),
    email: z
      .string()
      .email()
      .transform((s) => s.toLowerCase()),
    password: z.string().min(8).max(128),
  }),
  z.object({
    command: z.literal("create-user"),
    email: z
      .string()
      .email()
      .transform((s) => s.toLowerCase()),
    name: z.string().trim().min(1),
    password: z.string().min(8).max(128),
  }),
  z.object({
    command: z.literal("reset-password"),
    email: z
      .string()
      .email()
      .transform((s) => s.toLowerCase()),
    password: z.string().min(8).max(128),
  }),
]);

export async function handleOperatorRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST" || !isOperatorRequest(request.headers)) {
    return new Response("Not found", { status: 404 });
  }
  if (!(await usesBetterAuthServer())) {
    return Response.json(
      {
        error:
          "This installation runs without accounts (AUTH_MODE=local_noauth). Set AUTH_MODE=password and re-run initialization to manage accounts.",
      },
      { status: 409 },
    );
  }
  const parsed = commandSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json({ error: "Invalid account command" }, { status: 400 });
  const command = parsed.data;
  const auth = getAuth();
  try {
    if (command.command === "create-user") {
      const result = await auth.api.signUpEmail({
        headers: request.headers,
        body: {
          name: command.name,
          email: command.email,
          password: command.password,
        },
      });
      return Response.json({ id: result.user.id, email: result.user.email });
    }
    const context = await auth.$context;
    if (command.command === "claim-legacy-user") {
      const [existing] = await db
        .select()
        .from(user)
        .where(eq(user.id, command.userId))
        .limit(1);
      const [workspace] = await db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, command.organizationId))
        .limit(1);
      if (!existing || !workspace)
        return Response.json(
          { error: "Imported user or organization not found" },
          { status: 404 },
        );
      await context.internalAdapter.updateUser(existing.id, {
        email: command.email,
        emailVerified: false,
      });
      const [membership] = await db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.userId, existing.id),
            eq(member.organizationId, workspace.id),
          ),
        )
        .limit(1);
      if (membership)
        await db
          .update(member)
          .set({ role: "owner" })
          .where(eq(member.id, membership.id));
      else
        await db.insert(member).values({
          id: crypto.randomUUID(),
          userId: existing.id,
          organizationId: workspace.id,
          role: "owner",
          createdAt: new Date(),
        });
      await db
        .update(user)
        .set({ lastActiveOrganizationId: workspace.id })
        .where(eq(user.id, existing.id));
    }

    const found = await context.internalAdapter.findUserByEmail(command.email, {
      includeAccounts: true,
    });
    if (!found)
      return Response.json({ error: "Account not found" }, { status: 404 });
    const password = await context.password.hash(command.password);
    if (found.accounts.some((account) => account.providerId === "credential")) {
      await context.internalAdapter.updatePassword(found.user.id, password);
    } else {
      await context.internalAdapter.createAccount({
        userId: found.user.id,
        providerId: "credential",
        accountId: found.user.id,
        password,
      });
    }
    await context.internalAdapter.deleteUserSessions(found.user.id);
    return Response.json({ id: found.user.id, email: found.user.email });
  } catch (error) {
    console.error("[account-admin] Account command failed", error);
    return Response.json(
      { error: "Account command failed; check the server logs" },
      { status: 400 },
    );
  }
}
