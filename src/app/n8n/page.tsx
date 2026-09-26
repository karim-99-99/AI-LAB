import Link from "next/link";

/** n8n runs locally in Docker by default; set NEXT_PUBLIC_N8N_URL if hosted. */
const N8N_URL = process.env.NEXT_PUBLIC_N8N_URL?.trim() || "http://localhost:5678";
/** Where n8n's HTTP nodes point by default (see n8n/docker-compose.yml). */
const LIVE_URL =
  process.env.NEXT_PUBLIC_LIVE_URL?.trim() || "https://ai-lab-alpha-five.vercel.app";

const WORKFLOWS = [
  {
    file: "support-ticket.json",
    name: "Support ticket",
    endpoint: "POST /api/automation/support",
    flow: "Webhook → AI Lab drafts reply → pending approval → Gmail / outbox",
    when: "Customer support tickets that need a human gate before send",
  },
  {
    file: "email-automation.json",
    name: "Email automation",
    endpoint: "POST /api/automation/email",
    flow: "Webhook → structured email draft → optional requireApproval",
    when: "Outbound campaigns or follow-ups with Zod-validated JSON",
  },
  {
    file: "crm-lead.json",
    name: "CRM lead",
    endpoint: "POST /api/automation/crm",
    flow: "Webhook → extract lead fields → save to local CRM store",
    when: "Inbound lead text that should become a CRM row",
  },
  {
    file: "meeting-summary.json",
    name: "Meeting summary",
    endpoint: "POST /api/automation/meeting",
    flow: "Webhook → summarize transcript → tasks list",
    when: "Meeting notes / call transcripts",
  },
] as const;

export default function N8nPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 md:py-12">
      <section className="lab-animate-in space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--lab-accent)]">
          Orchestration
        </p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          n8n Workflows
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-[var(--lab-ink-muted)]">
          n8n is the trigger and integration layer. AI Lab is the brain.
          Import the templates below into Docker n8n, point webhooks at your
          Next.js APIs, then review drafts in Approvals.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={N8N_URL}
            target="_blank"
            rel="noreferrer"
            className="lab-btn-primary inline-flex px-4 py-2 text-sm"
          >
            Open n8n UI
          </a>
          <Link
            href="/approve"
            className="inline-flex rounded-[0.65rem] border border-[var(--lab-border)] bg-[var(--lab-surface)] px-4 py-2 text-sm font-medium"
          >
            Open approval queue
          </Link>
          <Link
            href="/"
            className="inline-flex rounded-[0.65rem] border border-[var(--lab-border)] bg-[var(--lab-surface)] px-4 py-2 text-sm font-medium"
          >
            Back to Studio
          </Link>
        </div>
      </section>

      <section
        className="lab-animate-in lab-panel space-y-3 p-5"
        style={{ animationDelay: "60ms" }}
      >
        <h2 className="text-lg font-semibold">Architecture</h2>
        <pre className="overflow-x-auto rounded-xl bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] p-4 font-mono text-xs leading-relaxed text-[var(--lab-ink-muted)]">
{`Trigger (webhook / schedule / Gmail)
        │
        ▼
   n8n workflow  ──HTTP──►  AI Lab API  (Groq + Zod)
        │                         │
        │                         ▼
        │                   draft / extract
        │                         │
        └──────────────►  /approve  (human edit)
                                  │
                                  ▼
                           Gmail or local outbox`}
        </pre>
      </section>

      <section
        className="lab-animate-in space-y-4"
        style={{ animationDelay: "100ms" }}
      >
        <h2 className="text-lg font-semibold">Importable workflows</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {WORKFLOWS.map((w) => (
            <article key={w.file} className="lab-panel space-y-2 p-4">
              <h3 className="text-base font-semibold text-[var(--lab-accent)]">
                {w.name}
              </h3>
              <p className="font-mono text-[11px] text-[var(--lab-ink-muted)]">
                n8n/workflows/{w.file}
              </p>
              <p className="text-sm text-[var(--foreground)]">{w.flow}</p>
              <p className="text-xs text-[var(--lab-ink-muted)]">
                <span className="font-medium">API:</span> {w.endpoint}
              </p>
              <p className="text-xs text-[var(--lab-ink-muted)]">
                <span className="font-medium">Use when:</span> {w.when}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="lab-animate-in lab-panel space-y-3 p-5"
        style={{ animationDelay: "140ms" }}
      >
        <h2 className="text-lg font-semibold">Run locally</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--lab-ink-muted)]">
          <li>
            Start stack:{" "}
            <code className="rounded bg-[var(--lab-accent-soft)] px-1.5 py-0.5 font-mono text-xs">
              docker compose -f n8n/docker-compose.yml up -d
            </code>
          </li>
          <li>
            Open{" "}
            <a className="underline" href={N8N_URL}>
              {N8N_URL}
            </a>{" "}
            and import a JSON from{" "}
            <code className="font-mono text-xs">n8n/workflows/</code>
          </li>
          <li>
            Activate the workflow. HTTP nodes read{" "}
            <code className="font-mono text-xs">AI_LAB_BASE_URL</code> (default:
            the live app{" "}
            <code className="font-mono text-xs">{LIVE_URL}</code>) and send
            header <code className="font-mono text-xs">x-practice-key</code>.
            Override with{" "}
            <code className="font-mono text-xs">
              AI_LAB_BASE_URL=http://host.docker.internal:3001
            </code>{" "}
            to target local dev.
          </li>
          <li>
            After a support/email run, review at{" "}
            <Link href="/approve" className="underline">
              /approve
            </Link>{" "}
            — edit To / Subject / Body, then Approve or Reject.
          </li>
        </ol>
        <p className="text-xs text-[var(--lab-ink-muted)]">
          Full notes: <code className="font-mono">n8n/DOCKER.md</code> and{" "}
          <code className="font-mono">n8n/README.md</code> in the repo.
        </p>
      </section>

      <section
        className="lab-animate-in lab-panel space-y-2 p-5"
        style={{ animationDelay: "180ms" }}
      >
        <h2 className="text-lg font-semibold">Also in this stack</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--lab-ink-muted)]">
          <li>Redis on :6379 for RAG answer cache (same docker-compose)</li>
          <li>
            In-app Automation API tab — test the same endpoints without n8n
          </li>
          <li>
            Research agent can queue email drafts into the same approval queue
          </li>
        </ul>
      </section>
    </main>
  );
}
