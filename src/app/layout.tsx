import type { Metadata, Viewport } from "next";
import { Azeret_Mono, Familjen_Grotesk } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SITE } from "@/lib/config/site";

const familjen = Familjen_Grotesk({
  subsets: ["latin"],
  variable: "--font-familjen",
  display: "swap",
});

const azeret = Azeret_Mono({
  subsets: ["latin"],
  variable: "--font-azeret",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.liveUrl),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "post-quantum cryptography",
    "harvest now decrypt later",
    "cryptographic inventory",
    "NIST IR 8547",
    "ML-KEM",
    "Shor algorithm",
    "Grover algorithm",
    "quantum security",
    "MCP",
  ],
  authors: [{ name: "aniruddhaadak80" }],
  alternates: { canonical: SITE.liveUrl },
  openGraph: {
    type: "website",
    url: SITE.liveUrl,
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE.name} readiness survey` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0e0c0b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${familjen.variable} ${azeret.variable}`}>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-[2px] focus:bg-basalt-800 focus:px-4 focus:py-2 focus:text-ash-100"
        >
          Skip to content
        </a>
        <div className="relative z-10 flex min-h-dvh flex-col">
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}