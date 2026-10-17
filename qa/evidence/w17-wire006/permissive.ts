// MUTATION-ONLY (never committed): a visibility gate that admits everything, standing in for "the guard removed".
export function createPermissiveVisibility(db: any) {
  const one = (name: string, filter: object) => db.collection(name).findOne(filter);
  return {
    async filterTurns(_t: string, rows: any[]) { return [...rows]; },
    async sessionVisible() { return true; },
    async sourceVisible() { return true; },
    async claimVisible() { return true; },
    async eligibleTurn() { return true; },
    async safeCitationSession(tenantId: string, sessionId: string) { return one("sessions", { tenantId, _id: sessionId }); },
    async trustedTree(_t: string, root: any) { return root; },
  };
}
