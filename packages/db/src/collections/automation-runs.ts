import type { AutomationRuns } from '@lkb/core';
import { getDb } from '../client.js';
import { scopedCollection } from '../lib/tenantScope.js';

/** The runtime receives this tenant-scoped accessor, never a raw Mongo collection. */
export const automationRuns = (tenantId: string, db = getDb()) => scopedCollection<AutomationRuns>(db, 'automation_runs')(tenantId);
