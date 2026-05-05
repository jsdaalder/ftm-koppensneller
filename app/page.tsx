import { redirect } from "next/navigation";

export default async function HomePage() {
  // Keep the root route extremely simple and resilient in production.
  // Login page performs the "already signed in → /app" redirect client-side.
  redirect("/login");
}
