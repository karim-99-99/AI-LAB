"use client";

import { useRef, useState } from "react";
import { practiceHeaders } from "@/lib/client-headers";
import type { UsageInfo } from "@/lib/usage";
import { UsageBadge } from "./UsageBadge";

type Message = { role: "user" | "assistant"; content: string };

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    const assistantIndex = nextMessages.length;
    setMessages([...nextMessages, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: practiceHeaders(),
        body: JSON.stringify({
          messages: nextMessages,
          conversationId,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Request failed");
      }

      if (!res.body) throw new Error("No stream body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const payload = JSON.parse(line.slice(5).trim()) as {
            type: string;
            text?: string;
            error?: string;
            usage?: UsageInfo;
            conversationId?: string;
          };

          if (payload.type === "token" && payload.text) {
            assistantText += payload.text;
            setMessages((prev) => {
              const copy = [...prev];
              copy[assistantIndex] = {
                role: "assistant",
                content: assistantText,
              };
              return copy;
            });
          } else if (payload.type === "done") {
            if (payload.usage) setUsage(payload.usage);
            if (payload.conversationId) {
              setConversationId(payload.conversationId);
            }
          } else if (payload.type === "error") {
            throw new Error(payload.error || "Stream error");
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Stream stopped");
      } else {
        setError(err instanceof Error ? err.message : "Chat failed");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Streaming tokens live. Conversations save to the local store.
        {conversationId ? ` · id ${conversationId}` : ""}
      </p>
      <div className="min-h-64 max-h-96 space-y-3 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">
            Ask anything — replies stream token by token.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "ml-8 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "mr-8 bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            }`}
          >
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide opacity-60">
              {m.role}
            </span>
            {m.content || (loading ? "…" : "")}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-600 dark:bg-zinc-900"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message…"
          disabled={loading}
        />
        {loading ? (
          <button
            type="button"
            onClick={stop}
            className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={!input.trim()}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <UsageBadge usage={usage} />
    </div>
  );
}
