import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { AppProviders } from "@/components/providers";
import { TopBar } from "@/components/TopBar";
import { World } from "@/components/three/World";
import { Rails } from "@/components/motion/Rails";
import { Loader } from "@/components/motion/Loader";
import { MotionController } from "@/components/motion/MotionController";

export const metadata: Metadata = {
  title: "Hold My Controller",
  description: "Every game mechanic is a playable, forkable node graph. Authors are paid on Solana devnet when it is licensed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300..800&family=JetBrains+Mono:wght@400..600&family=Cinzel:wght@400..800&family=Marcellus&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AppProviders>
          <World />
          <div className="grain" aria-hidden="true" />
          <Rails />
          <Loader />
          <MotionController />
          <div className="app-shell">
          <a href="#main" className="sr-only">Skip to content</a>
          <TopBar />
          <main id="main">{children}</main>
          <footer style={{ position: "relative", background: "linear-gradient(180deg, transparent, rgba(7,6,13,0.85))" }}>
            <div className="wrap row tiny muted" style={{ justifyContent: "space-between", padding: "22px 28px", fontFamily: "var(--font-label)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              <span>Hold My Controller</span>
              <span className="row"><Link href="/learn">Tutorials</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/status">Status</Link></span>
            </div>
          </footer>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
