// D170 scope: accurate started status, never an acceptance closure.
import { readFileSync, writeFileSync } from 'node:fs';
const started = new Set(['T-011','T-013','T-014','T-015','T-028','U2.3','U2.5','T-038','T-053','T-059','T-060','T-061']);
const goal = JSON.parse(readFileSync('.goal/goal.json', 'utf8'));
for (const task of goal.tasks) if (started.has(task.id) && task.status === 'pending') task.status = 'in_progress';
goal.updated = new Date().toISOString();
goal.progress.in_progress = goal.tasks.filter(task => task.status === 'in_progress').length;
goal.progress.pending = goal.tasks.filter(task => task.status === 'pending').length;
writeFileSync('.goal/goal.json', JSON.stringify(goal, null, 2) + '\n');
const tasks = readFileSync('TASKS.md', 'utf8');
writeFileSync('TASKS.md', tasks.replace(/^(\| ([^|]+) \| )open( \|)/gm, (line, before, id, after) => started.has(id.trim()) ? before + 'in_progress' + after : line));
const registry = JSON.parse(readFileSync('qa/goal-2026-10-14/orchestration.json', 'utf8'));
for (const task of registry.tasks) if (started.has(task.id)) task.parentStatus = 'in_progress';
writeFileSync('qa/goal-2026-10-14/orchestration.json', JSON.stringify(registry, null, 2) + '\n');
const packet = readFileSync('qa/evidence/goal-t055/checker-feedback.md', 'utf8');
const feedback = packet.split('## Verbatim original feedback')[1].split('## Candidate and required measurement')[0].trim();
const inbox = readFileSync('qa/feedback-inbox.md', 'utf8');
if (!inbox.includes(feedback)) writeFileSync('qa/feedback-inbox.md', inbox + '\n\n## ISS-T055COLLECTIONS-001 — original static feedback, no executed RED\n\n' + feedback + '\n');
console.log(`Started parents reconciled: ${goal.progress.in_progress} in progress; ${goal.progress.pending} pending. All acceptance gates retained.`);
