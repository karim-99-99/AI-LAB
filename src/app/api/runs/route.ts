import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/guard";
import { readStore } from "@/lib/store";

export async function GET(request: Request) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;

  const store = await readStore();
  return NextResponse.json({
    runs: store.automation_runs,
    outbox: store.outbox.slice(0, 50),
    crm: store.crm.slice(0, 50),
    channel_messages: store.channel_messages.slice(0, 50),
    meetings: store.meetings.slice(0, 50),
  });
}
