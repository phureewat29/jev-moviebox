import type { Metadata } from "next";
import { Archivo, Bebas_Neue } from "next/font/google";
import "./globals.css";

/**
 * Archivo is a grotesque with a slight condensation to it, which is what film credits and
 * billing blocks are set in, and it holds up at the small sizes a poster grid needs. Bebas
 * carries the marquee lettering, and only that: a display face used for body text is a poster
 * shouting at you.
 */
const archivo = Archivo({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Movie Box",
  description: "Say how the day went. Jev reads it; the box is ranked for it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${bebas.variable} h-full antialiased`}>
      <body className="min-h-full bg-screen font-sans text-ink">{children}</body>
    </html>
  );
}
