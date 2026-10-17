/** Private publication belongs to the actual recording controller until child exit. */
export function createCapturePrivacyLifecycle({publish, tenantId, sessionId, required = false, onFailure}) {
  let attached = false, publication, failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    onFailure(Object.assign(new Error('Recorder privacy controller unavailable'), {code: 'SCHEDULER_PRIVACY_UNAVAILABLE'}));
  };
  return {
    attach(control) {
      if (attached) { fail(); return; }
      attached = true;
      publication = Promise.resolve().then(async () => {
        if (!publish) { if (required) fail(); return; }
        const dispose = await publish({tenantId, sessionId, control});
        if (dispose !== undefined && typeof dispose !== 'function' || required && !dispose) {
          fail(); return;
        }
        return dispose;
      }).catch(fail);
    },
    async finish() {
      if (required && !attached) fail();
      const dispose = await publication;
      if (dispose) { try { await dispose(); } catch { fail(); } }
    },
  };
}
