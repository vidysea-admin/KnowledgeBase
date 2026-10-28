import assert from 'node:assert/strict';
import { jobs, listJobs } from '../../../packages/db/src/collections/jobs.ts';
import { createMongoJobsReadDeps } from '../../../apps/api/src/jobs/store.ts';

// Read-only, database-shaped seam. No socket, real database, provider or mutation.
const secretError = new Error('PRIVATE credential path provider payload');
for (const failAt of ['find', 'toArray']) {
  const observed = [];
  const db = { collection(name) {
    assert.equal(name, 'jobs');
    return { find(filter) {
      observed.push(filter);
      if (failAt === 'find') throw secretError;
      const cursor = {
        project: () => cursor, sort: () => cursor, limit: () => cursor,
        toArray: async () => { throw secretError; },
      };
      return cursor;
    } };
  } };
  await assert.rejects(listJobs('owner', 1, db), error => error === secretError);
  const deps = createMongoJobsReadDeps(tenant => jobs(tenant, db));
  await assert.rejects(deps.listJobs('owner', 1), error => error === secretError);
  assert.deepEqual(observed, [{ tenantId: 'owner' }, { tenantId: 'owner' }]);
  console.log(`independent ${failAt}: DB reader and real API adapter propagate original failure; exact owner filters; PASS`);
}
console.log('independent failure boundaries 4/4 pass; no empty-success, writes or external calls');
