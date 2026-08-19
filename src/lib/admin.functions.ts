import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TENANT_DOMAIN = "flatrent.local";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}


function normalizeUsername(input: string) {
  return input.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

/** Public check: does an owner account exist yet? Used to gate /setup. */
export const ownerExists = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { count, error } = await sb
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "owner");
  if (error) return { exists: false, error: error.message };
  return { exists: (count ?? 0) > 0 };
});

const createOwnerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(64),
  name: z.string().min(1).max(80),
});

/** First-launch owner creation. Refuses once any owner exists. */
export const createOwner = createServerFn({ method: "POST" })
  .inputValidator((d) => createOwnerSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { count } = await sb
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "owner");
    if ((count ?? 0) > 0) {
      return { ok: false, error: "Owner already configured" };
    }

    const email = data.email.toLowerCase();
    const { data: created, error } = await sb.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, role: "owner" },
    });
    if (error || !created.user) return { ok: false, error: error?.message ?? "Failed" };

    const userId = created.user.id;
    await sb.from("profiles").upsert(
      { user_id: userId, name: data.name, mobile: email },
      { onConflict: "user_id" },
    );
    await sb.from("user_roles").upsert(
      { user_id: userId, role: "owner" },
      { onConflict: "user_id,role" },
    );
    await sb.from("settings").update({ owner_name: data.name }).eq("id", 1);

    return { ok: true };
  });

const createTenantSchema = z.object({
  flatId: z.string().uuid(),
  username: z.string().min(3).max(32),
  password: z.string().min(4).max(64),
  name: z.string().min(1).max(80),
});

export const createTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createTenantSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "owner")
      .maybeSingle();
    if (!roles) throw new Error("Only the owner can create tenants");

    const sb = await admin();
    const username = normalizeUsername(data.username);
    if (username.length < 3) return { ok: false, error: "Invalid username" };
    const email = `${username}@${TENANT_DOMAIN}`;

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
      await sb.auth.admin.updateUserById(userId, { password: data.password });
    }

    await sb.from("profiles").upsert(
      { user_id: userId, name: data.name, mobile: username },
      { onConflict: "user_id" },
    );
    await sb.from("user_roles").upsert(
      { user_id: userId, role: "tenant" },
      { onConflict: "user_id,role" },
    );

    const { error: flatErr } = await sb
      .from("flats")
      .update({ tenant_id: userId, tenant_name: data.name, tenant_mobile: username })
      .eq("id", data.flatId);
    if (flatErr) return { ok: false, error: flatErr.message };

    // Keep a server-side encrypted copy so the owner can view it again later.
    const key = process.env["TENANT_PASSWORD_KEY"];
    if (key) {
      await sb.rpc("set_tenant_password", {
        _tenant_id: userId,
        _password: data.password,
        _key: key,
      });
    }

    return { ok: true, userId };
  });

/** Owner-only: decrypt and reveal a tenant's current password. */
export const revealTenantPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "owner")
      .maybeSingle();
    if (!roles) throw new Error("Only the owner can view tenant passwords");

    const key = process.env["TENANT_PASSWORD_KEY"];
    if (!key) return { ok: false as const, error: "Encryption key not configured" };

    const sb = await admin();
    const { data: pw, error } = await sb.rpc("get_tenant_password", {
      _tenant_id: data.tenantId,
      _key: key,
    });
    if (error) return { ok: false as const, error: error.message };
    if (!pw) {
      return {
        ok: false as const,
        error: "No stored password yet — set a new one to enable viewing.",
      };
    }
    return { ok: true as const, password: pw as string };
  });

export const deleteTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "owner").maybeSingle();
    if (!roles) throw new Error("Only the owner can delete tenants");

    const sb = await admin();

    // Cleanup tenant document vault: storage files + DB rows (incl. any orphans in that folder).
    const { data: files } = await sb.storage
      .from("tenant-documents")
      .list(data.tenantId, { limit: 1000 });
    if (files && files.length > 0) {
      await sb.storage
        .from("tenant-documents")
        .remove(files.map((f) => `${data.tenantId}/${f.name}`));
    }
    await sb.from("tenant_documents").delete().eq("tenant_id", data.tenantId);

    await sb.from("flats").update({ tenant_id: null }).eq("tenant_id", data.tenantId);
    const { error } = await sb.auth.admin.deleteUser(data.tenantId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
