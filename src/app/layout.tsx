import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Handover AI | Fra avtale til leveranse",
  description:
    "Kontroller at avtalte leveranseforpliktelser følger med fra salg til prosjektteam. Prototype for syntetiske dokumenter.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
