export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return;
  const originHost = new URL(origin).host;
  if (originHost !== host) {
    throw new Error("FORBIDDEN_ORIGIN");
  }
}
