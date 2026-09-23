/**
 * `npm run check:services` — verifies every third-party credential in
 * `.env.local` with free, read-only calls. Never spends Magic Hour credits.
 *
 * Runs under tsx with the `react-server` export condition, so `server-only`
 * resolves to its no-op entry exactly as it does inside Next's server bundle.
 */
import { listOfFiles, UploadcareSimpleAuthSchema } from '@uploadcare/rest-client';
import { clientEnv } from '@/lib/env/client';
import { requireServerEnv } from '@/lib/env/server';
import { closeMongoClient, ensureIndexes, getDb } from '@/server/db';
import { getAccount, pingCloudinary } from '@/server/services';

type Check = { name: string; run: () => Promise<string> };

const checks: Check[] = [
  {
    name: 'MongoDB',
    run: async () => {
      const db = await getDb();
      await db.command({ ping: 1 });
      await ensureIndexes();
      return `connected to "${db.databaseName}", indexes ensured`;
    },
  },
  {
    name: 'Cloudinary',
    run: async () => {
      await pingCloudinary();
      return 'admin API ping ok';
    },
  },
  {
    name: 'Uploadcare',
    run: async () => {
      const { UPLOADCARE_SECRET_KEY } = requireServerEnv('UPLOADCARE_SECRET_KEY');
      const publicKey = clientEnv().NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY;
      if (!publicKey) {
        throw new Error('Missing required environment variable(s): NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY.');
      }
      const authSchema = new UploadcareSimpleAuthSchema({ publicKey, secretKey: UPLOADCARE_SECRET_KEY });
      const page = await listOfFiles({ limit: 1 }, { authSchema });
      return `REST API ok (${page.total} file(s) in project)`;
    },
  },
  {
    name: 'Magic Hour',
    run: async () => {
      const { tier, credits } = await getAccount();
      return `GET /v1/account ok — tier "${tier}", ${credits} credits`;
    },
  },
];

/** Services wrap SDK errors into sanitized causes; anything else is never dumped, as it may hold credentials. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause === undefined ? '' : ` (cause: ${JSON.stringify(error.cause, replacer)})`;
    return `${error.message}${cause}`;
  }
  return 'non-Error rejection (details withheld)';
}

function replacer(_key: string, value: unknown): unknown {
  return value instanceof Error ? { name: value.name, message: value.message } : value;
}

async function main(): Promise<void> {
  let failed = 0;
  for (const { name, run } of checks) {
    try {
      console.log(`✔ PASS  ${name} — ${await run()}`);
    } catch (error) {
      failed += 1;
      console.log(`✘ FAIL  ${name} — ${describeError(error)}`);
    }
  }
  await closeMongoClient().catch(() => undefined);
  console.log(
    failed === 0 ? '\nAll services reachable.' : `\n${failed} of ${checks.length} check(s) failed.`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
}

await main();
