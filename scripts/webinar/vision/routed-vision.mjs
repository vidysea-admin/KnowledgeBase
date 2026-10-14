/** ollamafirst (flag LKB_VISION_ROUTED=1): frame -> analysis through the ordered provider chain from
 * config/ai-routing.yaml (`vision: [ollama, gemini]`). `lib` is { runVisionChain } from packages/ai (injected so the
 * flag-off path imports nothing new); `tally` is the run report's fallback counter. A backend whose reply fails
 * `validate` counts as failed and the chain moves on. */
import { readFileSync } from 'node:fs';

export function routedVision(lib, backends, { prompt, validate, tally, log, schema } = {}) {
  return async (frame) => {
    const { value } = await lib.runVisionChain(backends, {
      imageBase64: readFileSync(frame.path).toString('base64'), mimeType: 'image/jpeg', prompt, schema,
    }, { tally, log, validateJson: validate });
    return value;
  };
}

/** Parses the `vision` chain out of config/ai-routing.yaml text (flat `key: [a, b]` shape); default ollama, gemini. */
export function visionOrderFromYaml(text) {
  const m = /^vision:\s*\[(.*)\]\s*$/m.exec(text ?? '');
  const order = m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : [];
  return order.length ? order : ['ollama', 'gemini'];
}
