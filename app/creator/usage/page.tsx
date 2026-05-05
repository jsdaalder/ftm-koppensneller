import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireCreatorOrRedirect() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (role?.role !== "creator") redirect("/app");
}

export default async function CreatorUsagePage() {
  await requireCreatorOrRedirect();
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: globalUsage }, { data: byUser }, { data: users }] = await Promise.all([
    supabase
      .from("daily_global_usage")
      .select("usage_date,generation_calls")
      .eq("usage_date", today)
      .maybeSingle(),
    supabase
      .from("daily_usage")
      .select("user_id,generation_calls")
      .eq("usage_date", today)
      .order("generation_calls", { ascending: false })
      .limit(100),
    supabase.from("user_roles").select("user_id,role"),
  ]);

  const roleMap = new Map<string, string>();
  for (const u of users ?? []) roleMap.set(u.user_id, u.role);

  return (
    <main className="container">
      <div className="card" style={{ marginBottom: 16 }}>
        <h1>Usage Dashboard</h1>
        <p>Date: {today}</p>
        <p>
          Global generation calls today: <strong>{globalUsage?.generation_calls ?? 0}</strong>
        </p>
      </div>

      <div className="card">
        <h2>Per-user generation calls (today)</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>User ID</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Role</th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Calls</th>
            </tr>
          </thead>
          <tbody>
            {(byUser ?? []).map((row) => (
              <tr key={row.user_id}>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{row.user_id}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{roleMap.get(row.user_id) ?? "-"}</td>
                <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: 8 }}>
                  {row.generation_calls}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
