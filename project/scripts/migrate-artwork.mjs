import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL?.trim()) {
  if (process.env.VERCEL_ENV === 'production') throw new Error('DATABASE_URL is required for artwork checkout.');
  console.log('Artwork migration skipped: no database configured for this local/preview build.');
} else {
  const sql = neon(process.env.DATABASE_URL.trim());
  const migration = await readFile(new URL('../db/artwork.sql', import.meta.url), 'utf8');
  const statements = migration.split(';').map((text) => text.trim()).filter(Boolean);
  // Both linked Vercel projects may build together against this database.
  // Serialize this additive migration for the duration of the transaction.
  await sql.transaction([
    sql.query('SELECT pg_advisory_xact_lock(836902401)'),
    ...statements.map((statement) => sql.query(statement)),
  ]);
  console.log('Artwork purchase schema is ready. Existing booking tables were not changed.');
}
