/** Review-queue reads used by the shell (badge count). Full queue logic lands in P3. */
import { eq } from "drizzle-orm";
import { getDb, type Db } from "./db";
import { reviewQueue } from "./db/schema";

export function countPendingReviews(db: Db = getDb()): number {
  return db.select({ id: reviewQueue.id }).from(reviewQueue).where(eq(reviewQueue.status, "pending")).all()
    .length;
}
