/**
 * `npm run cleanup:uploadcare -- [--dry-run] [--confirm]`
 *
 * Deletes files from the Uploadcare project that are older than an hour.
 * Uploadcare is only the transit step — every upload is copied to Cloudinary
 * and deleted from Uploadcare straight away — so anything left there is a
 * leftover: an abandoned upload, or a copy whose delete failed. Younger
 * files are skipped so uploads still in flight are never touched.
 *
 * Dry run by default: it lists what it would delete. `--confirm` deletes.
 */

import { parseArgs } from 'node:util';
import { deleteFiles, listOfFiles, paginate } from '@uploadcare/rest-client';
import { uploadcareAuthSchema } from '@/server/services/uploadcare';
import {
  chunk,
  selectStaleFiles,
  UPLOADCARE_DELETE_BATCH,
  UPLOADCARE_MIN_AGE_MS,
} from '@/server/services/uploadcare-cleanup';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    confirm: { type: 'boolean', default: false },
  },
  strict: true,
});

if (values['dry-run'] && values.confirm) {
  console.error('✘ Pass either --dry-run or --confirm, not both.');
  process.exit(1);
}
const dryRun = !values.confirm;

async function main(): Promise<void> {
  const authSchema = uploadcareAuthSchema();
  const listed = [];
  // Everything is listed before anything is deleted, so deletes cannot shift the pages being read.
  for await (const page of paginate(listOfFiles)(
    { limit: 1000, ordering: 'datetime_uploaded' },
    { authSchema },
  )) {
    listed.push(...page.results);
  }
  const stale = selectStaleFiles(listed, Date.now());
  const minutes = UPLOADCARE_MIN_AGE_MS / 60_000;
  console.log(
    `${listed.length} file(s) in the project; ${stale.length} older than ${minutes} minutes.${dryRun ? ' (dry run)' : ''}`,
  );
  for (const file of stale) {
    console.log(
      `  ${dryRun ? 'would delete' : 'delete'}  ${file.uuid}  ${file.datetimeUploaded}  ${file.size} B  ${file.originalFilename}`,
    );
  }
  if (dryRun) {
    if (stale.length > 0) {
      console.log('\nNothing was deleted. Re-run with --confirm to delete these files.');
    }
    return;
  }

  let deleted = 0;
  let problems = 0;
  for (const batch of chunk(stale, UPLOADCARE_DELETE_BATCH)) {
    const response = await deleteFiles({ uuids: batch.map((file) => file.uuid) }, { authSchema });
    deleted += response.result.length;
    for (const [uuid, problem] of Object.entries(response.problems)) {
      problems += 1;
      console.log(`  ✘ ${uuid}: ${problem}`);
    }
  }
  console.log(`\nDeleted ${deleted} file(s)${problems ? `; ${problems} could not be deleted` : ''}.`);
  process.exitCode = problems === 0 ? 0 : 1;
}

await main();
