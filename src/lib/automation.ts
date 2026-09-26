import {
  newId,
  updateStore,
  type AutomationRun,
} from "@/lib/store";

export async function getIdempotentResponse(
  key: string | null
): Promise<unknown | null> {
  if (!key) return null;
  const { readStore } = await import("@/lib/store");
  const store = await readStore();
  return store.idempotency[key]?.response ?? null;
}

export async function saveIdempotentResponse(
  key: string | null,
  response: unknown
): Promise<void> {
  if (!key) return;
  await updateStore((store) => {
    store.idempotency[key] = {
      createdAt: new Date().toISOString(),
      response,
    };
    const keys = Object.keys(store.idempotency);
    if (keys.length > 200) {
      for (const k of keys.slice(0, keys.length - 200)) {
        delete store.idempotency[k];
      }
    }
  });
}

export function readIdempotencyKey(request: Request): string | null {
  return (
    request.headers.get("idempotency-key")?.trim() ||
    request.headers.get("x-idempotency-key")?.trim() ||
    null
  );
}

export async function logRun(
  partial: Omit<AutomationRun, "id" | "createdAt">
): Promise<AutomationRun> {
  const run: AutomationRun = {
    id: newId("run"),
    createdAt: new Date().toISOString(),
    ...partial,
  };
  await updateStore((store) => {
    store.automation_runs.unshift(run);
    store.automation_runs = store.automation_runs.slice(0, 200);
  });
  return run;
}
