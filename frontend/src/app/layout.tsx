// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import UTCclock from "./components/UTCclock";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Timelapse Dashboard",
  description: "Live camera and device monitor",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50`}
      >
        {/* Header with centered UTC clock */}
        <header className="sticky top-0 z-50 bg-white/95 dark:bg-neutral-900/90 backdrop-blur border-b border-neutral-200 dark:border-neutral-800">
          <div className="mx-auto max-w-6xl px-2 sm:px-6">
            <div className="h-14 flex items-center justify-center">
              <UTCclock />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
          {children}
        </main>

        <footer className="border-t border-neutral-200 dark:border-neutral-800">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-12 flex items-center text-xs text-neutral-500 dark:text-neutral-400">
            © {new Date().getFullYear()} Timelapse
          </div>
        </footer>
      </body>
    </html>
  );
}
