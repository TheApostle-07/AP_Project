import { neon } from '@neondatabase/serverless';

let sqlClient;

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL_REQUIRED');
  sqlClient ||= neon(url);
  return sqlClient;
}

export async function query(text, values = []) {
  return database().query(text, values);
}

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL?.trim());
}
