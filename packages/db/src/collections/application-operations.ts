import type { ApplicationOperations } from '@lkb/core';
import { getDb } from '../client.js';
import { scopedCollection } from '../lib/tenantScope.js';
export const applicationOperations = (tenantId: string, db = getDb()) => scopedCollection<ApplicationOperations>(db, 'application_operations')(tenantId);
