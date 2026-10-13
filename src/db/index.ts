import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// postgres() connects lazily, so importing this module never needs a live database
// (builds and unit tests run without DATABASE_URL).
const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/feedlist";

// Reuse the client across hot reloads in dev.
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client =
  globalForDb.pg ??
  postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    // Transaction poolers (Supabase, Neon "-pooler" hosts) do not support prepared statements.
    prepare: false,
  });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export { schema };
