import { sql } from "../lib/db";
import { hashPassword } from "../lib/auth/login";

/**
 * The cloned prod dump has 122 users but no known passwords. For local crafting we create one
 * Pusat super-admin (userlevel 10 / role 10) so the legacy role model can be exercised.
 * Legacy mst_users has no primary key, hence delete+insert instead of ON CONFLICT.
 * Never run against a shared environment.
 */
async function main() {
  const username = process.env.DEV_ADMIN_USERNAME ?? "inject_dev";
  const password = process.env.DEV_ADMIN_PASSWORD ?? "inject123";
  const hash = await hashPassword(password);

  await sql.begin(async (tx) => {
    await tx`delete from mst_users where id = 'inject-dev' or lower(username) = ${username.toLowerCase()}`;
    await tx`
      insert into mst_users (id, username, email, password, nama, ref_userlevel_id, ref_userrole_id, status, created_date, last_update_by, description)
      values ('inject-dev', ${username}, ${`${username}@local.dev`}, ${hash}, 'Inject Dev (lokal)', 10, 10, 1, now(), 'seed', 'Akun lokal untuk pengembangan modul inject')`;
  });
  console.log(`dev user ready: ${username} / ${password}  (userlevel 10 Pusat, role 10 Super Admin)`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
