import type { Metadata } from "next";
import { Archivo, Bebas_Neue } from "next/font/google";
import { Footer } from "@/components/Footer";
import { SITE } from "@/core/Site";
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

const DESCRIPTION = "Say how the day went. Jev reads it; the box is ranked for it.";

export const metadata: Metadata = {
  metadataBase: SITE,
  title: "Movie Box",
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: "Movie Box", description: DESCRIPTION, url: "/", siteName: "Movie Box", type: "website" },
  twitter: { card: "summary", title: "Movie Box", description: DESCRIPTION, creator: "@phureewat29" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${bebas.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-screen font-sans text-ink">
        {children}
        <Footer />
      </body>
    </html>
  );
}
