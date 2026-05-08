import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";

export async function getMcpUserEmail(userId: string) {
  const authUser = await db.query.user.findFirst({
    columns: { email: true },
    where: eq(user.id, userId),
  });

  return authUser?.email ?? null;
}
