import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const paths = ['apps/api/src/server.ts','apps/api/src/composition/production.ts','apps/api/src/composition/integrations/routes.ts',
  'apps/web/src/App.tsx','apps/web/src/layout/NavSidebar.tsx','apps/web/src/pages/MeetingBotPage.tsx','apps/web/src/pages/sessions/SessionDetailPage.tsx'];
const pins = Object.fromEntries(paths.filter(existsSync).map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
writeFileSync('qa/goal-2026-10-14/route-freeze.json', JSON.stringify({ checkpoint:'ROUTE_FREEZE',at:new Date().toISOString(),
  scope:'Shared API mount/production entrypoints and App navigation. Authorized module implementations remain independently pinned; current compiled proof pending.',
  pins, parentAcceptance:'NOT VERIFIED' }, null, 2) + '\n');
const feedback = readFileSync('qa/evidence/goal-t059-checker-feedback.md','utf8');
const inbox = readFileSync('qa/feedback-inbox.md','utf8');
if (!inbox.includes(feedback.trim())) writeFileSync('qa/feedback-inbox.md', inbox + '\n\n## ISS-T059REPLAY-001 — verbatim independent executed feedback\n\n' + feedback);
console.log('ROUTE_FREEZE entrypoint pins persisted; current compile and parent acceptance pending.');
