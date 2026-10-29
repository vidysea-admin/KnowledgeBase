// packages/db/src/collections/route-index.ts - D-208 item 2. `routeIndex(tenantId)` accessor for the persisted /route index:
// one document per tenant (`_id` = tenantId), tenant-scoped through scopedCollection like every other collection.
import type { RouteIndexDoc } from '@lkb/core';
import { getDb } from '../client.js';
import { scopedCollection } from '../lib/tenantScope.js';
export const routeIndex = (tenantId: string, db = getDb()) => scopedCollection<RouteIndexDoc>(db, 'route_index')(tenantId);
