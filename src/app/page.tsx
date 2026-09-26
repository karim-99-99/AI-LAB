"use client";

import { useState } from "react";
import { AgentPanel } from "@/components/AgentPanel";
import { AutomationPanel } from "@/components/AutomationPanel";
import { BlogPanel } from "@/components/BlogPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { EmailPanel } from "@/components/EmailPanel";
import { ExtractPanel } from "@/components/ExtractPanel";
import { GrammarPanel } from "@/components/GrammarPanel";
import { PdfPanel } from "@/components/PdfPanel";
import { RagIngestPanel } from "@/components/RagIngestPanel";
import { ResumePanel } from "@/components/ResumePanel";
import { SummarizePanel } from "@/components/SummarizePanel";

const MODES = [
  { id: "chat", label: "Streaming chat", group: "Core" },
  { id: "summarize", label: "Summarizer", group: "Core" },
  { id: "email", label: "Email writer", group: "Core" },
  { id: "grammar", label: "Grammar", group: "Core" },
  { id: "resume", label: "Resume analyzer", group: "Docs" },
  { id: "blog", label: "Blog generator", group: "Docs" },
  { id: "pdf", label: "PDF summarizer", group: "Docs" },
  { id: "extract", label: "Extraction", group: "Docs" },
  { id: "automation", label: "Automation API", group: "Ops" },
  { id: "rag", label: "RAG", group: "Knowledge" },
  { id: "agent", label: "Research agent", group: "Agents" },
] as const;

type ModeId = (typeof MODES)[number]["id"];

export default function Home() {
  const [mode, setMode] = useState<ModeId>("agent");
  const active = MODES.find((m) => m.id === mode);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 md:py-12">
      <section className="lab-animate-in space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--lab-accent)]">
          Karim · Applied AI
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-[var(--foreground)] md:text-5xl">
          AI Lab
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-[var(--lab-ink-muted)]">
          One studio for LLM APIs, document RAG, tool-using agents, human
          approval, and n8n-connected automation — powered by Groq.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a
            href="/n8n"
            className="lab-btn-primary inline-flex px-4 py-2 text-sm"
          >
            View n8n workflows
          </a>
          <a
            href="/approve"
            className="inline-flex rounded-[0.65rem] border border-[var(--lab-border)] bg-[var(--lab-surface)] px-4 py-2 text-sm font-medium"
          >
            Approval queue
          </a>
          <a
            href="/admin"
            className="inline-flex rounded-[0.65rem] border border-[var(--lab-border)] bg-[var(--lab-surface)] px-4 py-2 text-sm font-medium"
          >
            Usage &amp; guardrails
          </a>
        </div>
      </section>

      <section className="lab-animate-in lab-panel space-y-4 p-4 md:p-5" style={{ animationDelay: "80ms" }}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--lab-ink-muted)]">
              Workspace
            </p>
            <p className="text-sm text-[var(--foreground)]">
              {active?.group} · {active?.label}
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                mode === m.id
                  ? "bg-[var(--lab-accent)] text-white shadow-sm"
                  : "bg-[var(--lab-accent-soft)] text-[var(--foreground)] hover:opacity-90"
              }`}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </section>

      <section
        className="lab-animate-in lab-panel p-4 md:p-6"
        style={{ animationDelay: "140ms" }}
      >
        {mode === "chat" && <ChatPanel />}
        {mode === "summarize" && <SummarizePanel />}
        {mode === "email" && <EmailPanel />}
        {mode === "grammar" && <GrammarPanel />}
        {mode === "resume" && <ResumePanel />}
        {mode === "blog" && <BlogPanel />}
        {mode === "pdf" && <PdfPanel />}
        {mode === "extract" && <ExtractPanel />}
        {mode === "automation" && <AutomationPanel />}
        {mode === "rag" && <RagIngestPanel />}
        {mode === "agent" && <AgentPanel />}
      </section>
    </main>
  );
}
