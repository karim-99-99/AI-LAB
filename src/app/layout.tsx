import type { Metadata } from "next";
import { IBM_Plex_Mono, Outfit } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "AI Lab — Applied AI Automation",
  description:
    "RAG with citations, research agents, n8n workflows, human approval, usage dashboard, and LLM guardrails — powered by Groq.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="lab-shell flex min-h-full flex-col text-[var(--foreground)]">
        <AppHeader />
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
