/** Isolated test fixture only. Production uses the injected Mongo tenant wrapper, not this map. */
import { AutomationError, type AutomationRecord } from "./types.js";
import type { AutomationCollection } from "./store.js";
export class AutomationFixtureDatabase {
  rows = new Map<string, AutomationRecord>();
  failNextWrite = false;
  private write(): void { if (this.failNextWrite) { this.failNextWrite = false; throw new AutomationError("unavailable"); } }
  collection = (tenantId: string): AutomationCollection => {
    const matches = (row: AutomationRecord, filter: object) => row.tenantId === tenantId && Object.entries(filter).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v);
    return {
      findOne: async filter => structuredClone([...this.rows.values()].find(row => matches(row, filter)) ?? null),
      insertOne: async value => { this.write(); const row = structuredClone(value) as AutomationRecord; if (row.tenantId !== tenantId) throw new Error("foreign_insert"); if (this.rows.has(row._id)) throw Object.assign(new Error("duplicate"), { code: 11000 }); this.rows.set(row._id, row); return { acknowledged: true }; },
      replaceOne: async (filter, replacement) => { this.write(); const row = [...this.rows.values()].find(value => matches(value, filter)); if (!row) return { acknowledged: true, matchedCount: 0 }; const next = structuredClone(replacement) as AutomationRecord; if (next.tenantId !== tenantId) throw new Error("foreign_replace"); this.rows.set(row._id, next); return { acknowledged: true, matchedCount: 1 }; },
      find: filter => ({ sort: order => ({ limit: limit => ({ toArray: async () => {
        const rows = [...this.rows.values()].filter(row => matches(row, filter));
        const [key, direction] = Object.entries(order)[0]!;
        rows.sort((a, b) => (Number((a as unknown as Record<string, unknown>)[key]) - Number((b as unknown as Record<string, unknown>)[key])) * Number(direction));
        return structuredClone(rows.slice(0, limit));
      } }) }) }),
    };
  };
}
