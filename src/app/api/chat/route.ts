import { getOpenAI } from "@/lib/openai";
import { getModelForTask } from "@/lib/model-router";
import { guardRequest } from "@/lib/guard";
import { buildAndLogUsage } from "@/lib/usage-server";
import type { UsageInfo } from "@/lib/usage";
import { newId, updateStore } from "@/lib/store";

export const maxDuration = 60;

export async function POST(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  try {
    const body = await request.json();
    const messages = body.messages as
      | { role: "user" | "assistant" | "system"; content: string }[]
      | undefined;
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId : null;

    if (!messages?.length) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const model = getModelForTask("chat");
    const stream = await getOpenAI().chat.completions.create({
      model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        {
          role: "system",
          content:
            "You are a helpful practice chatbot for learning AI automation. Be clear and concise.",
        },
        ...messages,
      ],
    });

    const encoder = new TextEncoder();
    let full = "";
    let usage: UsageInfo | null = null;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) {
              full += delta;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "token", text: delta })}\n\n`)
              );
            }
            if (chunk.usage) {
              usage = buildAndLogUsage(model, chunk.usage, { route: "/api/chat" });
            }
          }

          if (!usage) {
            usage = buildAndLogUsage(
              model,
              {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
              },
              { route: "/api/chat" }
            );
          }

          const id = conversationId ?? newId("conv");
          await updateStore((store) => {
            const existing = store.conversations.find((c) => c.id === id);
            const nextMessages = [
              ...messages.filter((m) => m.role !== "system"),
              { role: "assistant" as const, content: full },
            ];
            if (existing) {
              existing.messages = nextMessages;
              existing.updatedAt = new Date().toISOString();
            } else {
              store.conversations.unshift({
                id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messages: nextMessages,
              });
            }
            store.conversations = store.conversations.slice(0, 50);
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", usage, conversationId: id })}\n\n`
            )
          );
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Chat stream failed";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed";
    console.error("[/api/chat]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
