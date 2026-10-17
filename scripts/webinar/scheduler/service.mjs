/** Five-minute autonomous cadence and bounded, independent capture-slot ownership. */
export const POLL_MS = 5 * 60 * 1000;
const SLOT = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function validateSlots(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8 ||
    value.some(id => typeof id !== 'string' || !SLOT.test(id) || RESERVED.test(id)) ||
    new Set(value).size !== value.length) throw new Error('Parallel scheduler requires two to eight distinct owned capture slots');
  return [...value];
}

/** Slots remain held through capture AND downstream processing. Rejection is isolated. */
export function createCapturePool(slots) {
  const holders = new Map(), tasks = new Map();
  return {
    has: id => tasks.has(id),
    slot: (preferred, supports = () => true) => preferred === undefined ? slots.find(slot => !holders.has(slot) && supports(slot) === true)
      : slots.includes(preferred) && !holders.has(preferred) && supports(preferred) === true ? preferred : undefined,
    start(id, slot, body) {
      if (tasks.has(id) || !slots.includes(slot) || holders.has(slot)) throw new Error('Capture slot is already owned or invalid');
      holders.set(slot, id);
      const task = Promise.resolve().then(() => body(slot)).finally(() => { holders.delete(slot); tasks.delete(id); });
      // Callers await drain; this handler prevents a rejection being unhandled beforehand.
      task.catch(() => {}); tasks.set(id, task); return task;
    },
    async drain() { while (tasks.size) await Promise.allSettled([...tasks.values()]); },
    get size() { return tasks.size; },
  };
}

export function abortableWait(ms, signal) {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms); signal?.addEventListener('abort', finish, {once: true});
    if (signal?.aborted) finish();
  });
}

/** Acquisition is serialized; capture promises never delay the next discovery deadline. */
export async function runAutonomousCycles({cycle, drain, signal, wait = abortableWait, log = () => {}, now = Date.now}) {
  try {
    while (!signal?.aborted) {
      const started = now();
      try { await cycle(); }
      catch (error) {
        if (error?.code !== 'WEBINAR_DISCOVERY_UNAVAILABLE') throw error;
        log('Webinar discovery unavailable; retrying next five-minute cycle; coverage requires attention');
      }
      if (!signal?.aborted) await wait(Math.max(0, POLL_MS - Math.max(0, now() - started)), signal);
    }
  } finally { await drain(); }
}
