import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function enforceDailyGenerationLimit(userId: string) {
  const maxPerDayPerUser = Number(process.env.DAILY_GENERATION_LIMIT || 60);
  const maxPerDayGlobal = Number(process.env.GLOBAL_DAILY_GENERATION_LIMIT || 400);
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc("consume_generation_quota", {
    p_user_id: userId,
    p_user_limit: maxPerDayPerUser,
    p_global_limit: maxPerDayGlobal,
  });
  if (error) throw error;

  const ok = data?.ok === true;
  if (ok) return;

  if (data?.reason === "user_limit") {
    throw new Error("DAILY_LIMIT_REACHED");
  }
  if (data?.reason === "global_limit") {
    throw new Error("GLOBAL_DAILY_LIMIT_REACHED");
  }

  throw new Error("QUOTA_CHECK_FAILED");
}
