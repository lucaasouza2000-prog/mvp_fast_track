import type { Metadata } from "next";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "FAST TRACK | Gestão de entregas",
  icons: { icon: "/fast-track-logo.png", apple: "/fast-track-logo.png" },
  description: "Fast Ariam e Nostra Via. Sua operação, no caminho certo.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
