import "./loadEnv.ts";
import { ensureUserProfileColumns } from "../api/_lib/ensureUserColumns";
import { loadFullBootstrapState } from "../api/_lib/bootstrap";
import { getDb } from "../api/_lib/db";
import { users } from "../api/_lib/schema";
import { eq } from "drizzle-orm";

await ensureUserProfileColumns();
const db = getDb();
const [admin] = await db.select().from(users).where(eq(users.username, "ds001"));
if (!admin) {
  console.error("找不到 ds001");
  process.exit(1);
}
const state = await loadFullBootstrapState(admin.id);
console.log("bootstrap ok", {
  users: state.users.length,
  sessionUserId: state.sessionUserId,
  adminPerms: state.users.find((u) => u.id === admin.id)?.permissions.length
});
