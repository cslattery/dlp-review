import { NextResponse } from "next/server";
import { dataSource } from "./store";

export function json<T>(body: T, init?: { status?: number }) {
  return NextResponse.json(
    { data_source: dataSource(), ...((body as object) ?? {}) },
    {
      status: init?.status ?? 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export function fail(message: string, status = 400) {
  return json({ error: message }, { status });
}

export async function readBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
