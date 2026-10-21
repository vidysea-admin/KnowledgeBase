/** w26-t041on: default-on resolution for webinar slide text (screen OCR + T-041 keyframe alignment).
 * Pure: reads env only, never prints a key. Provider order is config/ai-routing.yaml (Ollama first, Gemini last). */
const OFF = new Set(['0', 'false', 'off', 'no']);
export const flagOff = (v) => OFF.has(String(v ?? '').trim().toLowerCase());
const has = (v) => typeof v === 'string' && v.trim() !== '';
/** Returns { routed, vision, keyframeOcr, reason? }. Default ON; an explicit 0/false/off disables. A missing provider
 * degrades to a skip with a reason (callers log it), never a throw. */
export function visionPlan(env) {
  const routed = !flagOff(env.LKB_VISION_ROUTED);
  const ollama = has(env.OLLAMA_API_KEY) || has(env.OLLAMA_BASE_URL);
  const gemini = has(env.GEMINI_API_KEY) && has(env.WEBINAR_VISION_MODEL);
  const vision = routed ? ollama || gemini : gemini;
  if (!vision) return { routed, vision: false, keyframeOcr: false,
    reason: 'no vision provider configured (set OLLAMA_API_KEY, or GEMINI_API_KEY with WEBINAR_VISION_MODEL)' };
  if (flagOff(env.LKB_KEYFRAME_OCR)) return { routed, vision, keyframeOcr: false, reason: 'LKB_KEYFRAME_OCR is off' };
  return { routed, vision, keyframeOcr: true };
}
