import { neon } from '@neondatabase/serverless';
import { needsBookingDispatch, withBookingDispatch } from './background-dispatch.mjs';

let sqlClient;

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL_REQUIRED');
  sqlClient ||= neon(url);
  return sqlClient;
}

export async function query(text, values = []) {
  return withBookingDispatch(text, async () => {
    const sql = database();
    if (!needsBookingDispatch(text)) return sql.query(text, values);
    const result = await sql.transaction([
      sql.query("SET LOCAL statement_timeout = '15s'"), sql.query(text, values),
    ], { isolationLevel: 'ReadCommitted', fetchOptions: { signal: AbortSignal.timeout(30_000) } });
    return result[1];
  });
}

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL?.trim());
}
