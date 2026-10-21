import type { Metadata } from "next";
import Script from "next/script";
import { Inter, JetBrains_Mono } from "next/font/google";
import { DirectionProvider } from "@/components/foundations/direction/direction";

import "@/styles/globals.css";

// BoardUI's type scale is set in Inter with the optical-size axis, so display
// sizes render in the display grade and body sizes in the text grade from one
// variable font. The variable names are what styles/typography.css expects.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-source",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Apuração — Eleições 2026",
  description: "Acompanhe a apuração presidencial no Brasil, em tempo real.",
  authors: [{ name: "Eude Gabriel" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      dir="ltr"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-sans">
        {/* Apply an explicit preference first; otherwise follow the device theme. */}
        <Script id="boardui-theme" strategy="beforeInteractive">
          {`(function(){try{var theme=localStorage.getItem("boardui:theme");var dark=theme==="dark"||(theme!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark)}catch(e){document.documentElement.classList.toggle("dark",window.matchMedia("(prefers-color-scheme: dark)").matches)}})();`}
        </Script>
        <DirectionProvider locale="pt-BR">{children}</DirectionProvider>
      </body>
    </html>
  );
}
