"""Vision-model client for the page agent: Ollama Cloud models first, Gemini last (config/ai-routing.yaml `vision` order).
Keys come from the environment (or the repo .env); they are never printed or logged."""
import base64
import json
import os
import time
import urllib.error
import urllib.request

OLLAMA_URL = "https://ollama.com/api/chat"
BACKOFF_S = (2, 4, 8)


def first_json(text):
    """The first balanced {...} object in the text (models wrap JSON in prose or fences), else None."""
    start = text.find("{")
    while start >= 0:
        depth, in_str, esc = 0, False, False
        for i in range(start, len(text)):
            c = text[i]
            if in_str:
                esc = (c == "\\" and not esc)
                if c == '"' and not esc:
                    in_str = False
                continue
            if c == '"':
                in_str = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i + 1])
                    except ValueError:
                        break
        start = text.find("{", start + 1)
    return None


def load_env(path):
    """Fill missing OLLAMA/GEMINI variables from a .env file without overriding the real environment."""
    try:
        for line in open(path, encoding="utf-8"):
            k, _, v = line.strip().partition("=")
            if k in ("OLLAMA_API_KEY", "GEMINI_API_KEY", "OLLAMA_VISION_MODELS", "WEBINAR_VISION_MODEL") and v and k not in os.environ:
                os.environ[k] = v.strip().strip('"')
    except OSError:
        pass


def _post(url, body, headers, timeout=60):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json", **headers}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def providers(env=None):
    """[(label, call(prompt, jpeg_bytes) -> text)], Ollama Cloud models first, Gemini last."""
    env = os.environ if env is None else env
    out = []
    if env.get("OLLAMA_API_KEY"):
        for model in [m.strip() for m in (env.get("OLLAMA_VISION_MODELS") or "glm-5.3-flash,deepseek-v4.1-flash").split(",") if m.strip()]:
            def call(prompt, jpeg, model=model):
                r = _post(OLLAMA_URL, {"model": model, "stream": False, "messages": [{"role": "user", "content": prompt, "images": [base64.b64encode(jpeg).decode()]}]},
                          {"Authorization": "Bearer " + env["OLLAMA_API_KEY"]})
                return r["message"]["content"]
            out.append(("ollama:" + model, call))
    if env.get("GEMINI_API_KEY"):
        model = env.get("WEBINAR_VISION_MODEL") or "gemini-2.5-flash"

        def gcall(prompt, jpeg):
            r = _post("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % model,
                      {"contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(jpeg).decode()}}]}]},
                      {"x-goog-api-key": env["GEMINI_API_KEY"]})
            return r["candidates"][0]["content"]["parts"][0]["text"]
        out.append(("gemini:" + model, gcall))
    return out


def ask(prompt, jpeg, chain=None, sleep=time.sleep):
    """First provider that returns parseable JSON wins; a 429 retries with backoff, then falls to the next provider.
    Returns (label, dict). Raises RuntimeError when every provider fails (the error never contains a key)."""
    chain = providers() if chain is None else chain
    failures = []
    for label, call in chain:
        for attempt in range(len(BACKOFF_S) + 1):
            try:
                parsed = first_json(call(prompt, jpeg))
                if isinstance(parsed, dict):
                    return label, parsed
                failures.append("%s: no JSON object" % label)
                break
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < len(BACKOFF_S):
                    sleep(BACKOFF_S[attempt])
                    continue
                failures.append("%s: HTTP %s" % (label, e.code))
                break
            except Exception as e:  # network, shape, timeout
                failures.append("%s: %s" % (label, type(e).__name__))
                break
    raise RuntimeError("no vision model answered (%s)" % "; ".join(failures) if failures else "no vision provider configured (OLLAMA_API_KEY / GEMINI_API_KEY)")
