import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function creatorEmailAllowed(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const creators = parseCsv(process.env.CREATOR_EMAILS);
  if (creators.length === 0) return false;
  return creators.includes(normalized);
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
          cookiesToSet.forEach(({ name, value, options }) => req.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options as never),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const needsAuth = req.nextUrl.pathname.startsWith("/app") || req.nextUrl.pathname.startsWith("/creator");
  if (needsAuth && !user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && req.nextUrl.pathname.startsWith("/creator")) {
    if (creatorEmailAllowed(user.email ?? null)) return res;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!roleRow || roleRow.role !== "creator") {
      return NextResponse.redirect(new URL("/app", req.url));
    }
  }
  return res;
}

export const config = {
  matcher: ["/app/:path*", "/creator/:path*", "/docs/:path*"],
};
