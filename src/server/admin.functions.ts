import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MOBILE_DOMAIN = "flatrent.local";

function admin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function normalizeMobile(input: string) {
  return input.replace(/\D/g, "");
}

/**
 * Idempotent owner seeding from server secrets. Anyone can call this — but it
 * only ever creates / updates the single owner account whose mobile is set in
 * OWNER_MOBILE. Used once at first launch.
 */
export const seedOwner = createServerFn({ method: "POST" }).handler(async () => {
  const mobile = normalizeMobile(process.env.OWNER_MOBILE ?? "");
  const password = process.env.OWNER_PASSWORD ?? "";
  const name = process.env.OWNER_NAME ?? "Owner";
  if (!mobile || !password) {
    return { ok: false, error: "Owner credentials not configured" };
  }
  const email = `${mobile}@${MOBILE_DOMAIN}`;
  const sb = admin();

  // Check if user already exists by listing
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  let userId = list?.users.find((u) => u.email === email)?.id;

  if (!userId) {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: "owner" },
    });
    if (error) return { ok: false, error: error.message };
    userId = data.user!.id;
  }

  // Upsert profile + role + settings owner_name
  await sb.from("profiles").upsert({ user_id: userId, name, mobile }, { onConflict: "user_id" });
  await sb.from("user_roles").upsert({ user_id: userId, role: "owner" }, { onConflict: "user_id,role" });
  await sb.from("settings").update({ owner_name: name }).eq("id", 1);

  return { ok: true };
});

const createTenantSchema = z.object({
  flatId: z.string().uuid(),
  mobile: z.string().min(10).max(15),
  password: z.string().min(4).max(64),
  name: z.string().min(1).max(80),
});

export const createTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createTenantSchema.parse(d))
  .handler(async ({ data, context }) => {
    // verify caller is owner
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "owner")
      .maybeSingle();
    if (!roles) throw new Error("Only the owner can create tenants");

    const sb = admin();
    const mobile = normalizeMobile(data.mobile);
    const email = `${mobile}@${MOBILE_DOMAIN}`;

    // Find or create user
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let userId = list?.users.find((u) => u.email === email)?.id;

    if (!userId) {
      const { data: created, error } = await sb.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { name: data.name, role: "tenant" },
      });
      if (error) return { ok: false, error: error.message };
      userId = created.user!.id;
    } else {
      // update password if user already existed
      await sb.auth.admin.updateUserById(userId, { password: data.password });
    }

    await sb.from("profiles").upsert(
      { user_id: userId, name: data.name, mobile },
      { onConflict: "user_id" },
    );
    await sb.from("user_roles").upsert(
      { user_id: userId, role: "tenant" },
      { onConflict: "user_id,role" },
    );

    // Link to flat
    const { error: flatErr } = await sb
      .from("flats")
      .update({ tenant_id: userId, tenant_name: data.name, tenant_mobile: mobile })
      .eq("id", data.flatId);
    if (flatErr) return { ok: false, error: flatErr.message };

    return { ok: true, userId };
  });

export const deleteTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "owner").maybeSingle();
    if (!roles) throw new Error("Only the owner can delete tenants");

    const sb = admin();
    // Unlink from flats first (ON DELETE SET NULL handles, but be explicit)
    await sb.from("flats").update({ tenant_id: null }).eq("tenant_id", data.tenantId);
    const { error } = await sb.auth.admin.deleteUser(data.tenantId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
