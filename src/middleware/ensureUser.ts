import { createMiddleware } from "@tanstack/react-start";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  authenticateRequest,
  getAuthConfig,
} from "@every-app/sdk/tanstack/server";
import { AppError } from "@/server/lib/errors";

export const ensureUserMiddleware = createMiddleware({
  type: "function",
}).server(async (c) => {
  const { next } = c;
  const authConfig = getAuthConfig();

  const session = await authenticateRequest(authConfig);

  if (!session || !session.email) {
    throw new AppError("UNAUTHENTICATED");
  }

  const userId = session.sub;

  // Check if user exists
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    await db.insert(users).values({
      id: userId,
      email: session.email,
    });
  }

  return next({
    context: {
      userId,
      userEmail: user?.email || session.email,
      session,
    },
  });
});
