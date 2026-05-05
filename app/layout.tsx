import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FTM Koppensneller",
  description: "Interne tool voor headline-iteraties",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
