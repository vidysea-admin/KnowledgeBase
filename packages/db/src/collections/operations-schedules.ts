import type { OperationsSchedules } from '@lkb/core';
import { getDb } from '../client.js';
import { scopedCollection } from '../lib/tenantScope.js';
export const operationsSchedules = (tenantId: string, db = getDb()) => scopedCollection<OperationsSchedules>(db, 'operations_schedules')(tenantId);
