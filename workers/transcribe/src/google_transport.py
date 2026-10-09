"""Restricted Gemini File API transport; credentials and upload capabilities stay in memory."""
import hashlib
import json
import os
import re
import stat
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HOST = "generativelanguage.googleapis.com"
MAX_RESPONSE = 2 * 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def safe_file(root, reference, tenant):
    segment = hashlib.sha256(tenant.encode()).hexdigest()
    if not re.fullmatch(rf"{segment}/blobs/[a-f0-9]{{64}}\.bin", reference or ""):
        raise ValueError("unsafe-blob-reference")
    root = Path(root).absolute()
    path = root / reference
    parts = list(reversed(root.parents)) + [root]
    parts.extend(root.joinpath(*Path(reference).parts[:i]) for i in range(1, len(Path(reference).parts) + 1))
    for part in parts:
        info = part.lstat()
        if part.is_symlink() or getattr(info, "st_file_attributes", 0) & 0x400:
            raise ValueError("linked-blob-refused")
    actual = path.resolve(strict=True)
    actual.relative_to(root.resolve(strict=True))
    before = actual.stat()
    fd = os.open(actual, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        held = os.fstat(fd)
        if not stat.S_ISREG(held.st_mode) or held.st_nlink != 1 or (held.st_dev, held.st_ino) != (before.st_dev, before.st_ino):
            raise ValueError("blob-substitution")
        if path.resolve(strict=True) != actual:
            raise ValueError("blob-substitution")
        with os.fdopen(fd, "rb", closefd=False) as source:
            data = source.read(1024 * 1024 * 1024 + 1)
        after = os.fstat(fd)
        if len(data) > 1024 * 1024 * 1024 or (held.st_size, held.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError("blob-changed-or-oversized")
        return data
    finally:
        os.close(fd)


def provider_url(url, operation):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname != HOST or parsed.port or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("unsupported-provider-boundary")
    allowed_query = {"upload_id", "upload_protocol"} if operation == "upload-finalize" else set()
    if set(urllib.parse.parse_qs(parsed.query)) - allowed_query:
        raise ValueError("secret-or-unsupported-query")
    paths = {"upload-start": r"/upload/v1beta/files", "upload-finalize": r"/upload/v1beta/files",
        "poll": r"/v1beta/files/[a-zA-Z0-9_-]+", "generate": r"/v1beta/models/[a-zA-Z0-9._-]+:generateContent"}
    if not re.fullmatch(paths.get(operation, r"(?!)"), parsed.path):
        raise ValueError("unsupported-provider-path")
    return url


class GoogleTransport:
    def __init__(self, queue, spool, api_key, timeout=1800):
        self.queue, self.spool, self.api_key, self.timeout = queue, spool, api_key, timeout
        self.uploads = {}
        self.opener = urllib.request.build_opener(NoRedirect())

    def _http(self, url, method, headers, body):
        if not self.api_key:
            raise ValueError("worker-provider-key-missing")
        headers = {**headers, "x-goog-api-key": self.api_key}
        request = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            response = self.opener.open(request, timeout=self.timeout)
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            return {"status": status, "headers": {}, "body": {"error": "provider-rejected-operation"}}
        with response:
            raw = response.read(MAX_RESPONSE + 1)
            if len(raw) > MAX_RESPONSE:
                raise ValueError("provider-response-oversized")
            try:
                body = json.loads(raw) if raw else None
            except (ValueError, UnicodeError):
                raise ValueError("provider-response-not-json")
            clean = json.dumps(body).replace(self.api_key, "[redacted]")
            result = {"status": response.status, "headers": {}, "body": json.loads(clean)}
            upload = response.headers.get("x-goog-upload-url")
            if upload:
                result["upload_url"] = provider_url(upload, "upload-finalize")
            return result

    def execute(self, doc):
        request = doc.get("request", {})
        if doc.get("tenantId") != self.queue.tenant or not re.fullmatch(r"[a-f0-9]{64}", doc.get("_id", "")) or not re.fullmatch(r"[a-f0-9]{64}", doc.get("runId", "")):
            raise ValueError("foreign-or-invalid-operation-identity")
        if len(json.dumps(request).encode()) > 128 * 1024:
            raise ValueError("operation-envelope-oversized")
        op, method = request.get("op"), request.get("method")
        expected = {"upload-start": "POST", "upload-finalize": "PUT", "poll": "GET", "generate": "POST"}
        if method != expected.get(op) or set(request) - {"op", "url", "method", "headers", "body"}:
            raise ValueError("unsupported-operation")
        headers = request.get("headers", {})
        allowed = {"upload-start": {"content-type", "x-goog-upload-protocol", "x-goog-upload-command", "x-goog-upload-header-content-length", "x-goog-upload-header-content-type"},
            "upload-finalize": {"x-goog-upload-offset", "x-goog-upload-command"}, "poll": set(), "generate": {"content-type"}}
        if not isinstance(headers, dict) or set(headers) - allowed[op] or any(not isinstance(v, str) or "\n" in v or "\r" in v for v in headers.values()):
            raise ValueError("unsupported-header")
        body = request.get("body")
        if op == "upload-finalize":
            matched = re.fullmatch(r"queue-upload://([a-f0-9]{64})", request.get("url", ""))
            if not matched or not isinstance(body, dict) or set(body) != {"blob", "sha256", "size"}:
                raise ValueError("invalid-upload-handoff")
            start_id = matched[1]
            expected_binding = (self.queue.tenant, doc["runId"], start_id, "upload-start")
            cached = self.uploads.get(start_id)
            if cached is not None and (not isinstance(cached, dict) or cached.get("binding") != expected_binding):
                raise ValueError("foreign-or-missing-upload-handoff")
            start = self.queue.collection.find_one(self.queue.scoped({"_id": start_id, "status": "done",
                "runId": doc["runId"], "request.op": "upload-start"}))
            if not start or start.get("tenantId") != self.queue.tenant or start.get("runId") != doc["runId"] or start.get("request", {}).get("op") != "upload-start":
                raise ValueError("foreign-or-missing-upload-handoff")
            if start_id not in self.uploads:
                # Restart recovery reopens this scoped start operation; no upload token is durable.
                self.execute(start)
            cached = self.uploads[start_id]
            if not isinstance(cached, dict) or cached.get("binding") != expected_binding:
                raise ValueError("foreign-or-missing-upload-handoff")
            url = provider_url(cached["url"], "upload-finalize")
            data = safe_file(self.spool, body["blob"], self.queue.tenant)
            if len(data) != body["size"] or hashlib.sha256(data).hexdigest() != body["sha256"]:
                raise ValueError("staged-blob-hash-mismatch")
            if headers != {"x-goog-upload-offset": "0", "x-goog-upload-command": "upload, finalize"}:
                raise ValueError("invalid-finalize-headers")
            self.uploads.pop(start_id)
        else:
            url = provider_url(request.get("url", ""), op)
            if op == "upload-start":
                if not isinstance(body, dict) or set(body) != {"file"} or not isinstance(body["file"], dict) or set(body["file"]) != {"display_name"}:
                    raise ValueError("invalid-upload-metadata")
                if not isinstance(body["file"]["display_name"], str) or len(body["file"]["display_name"]) > 200:
                    raise ValueError("invalid-upload-name")
                if headers.get("x-goog-upload-protocol") != "resumable" or headers.get("x-goog-upload-command") != "start" or headers.get("content-type") != "application/json":
                    raise ValueError("invalid-upload-headers")
                if not re.fullmatch(r"[0-9]{1,10}", headers.get("x-goog-upload-header-content-length", "")) or int(headers["x-goog-upload-header-content-length"]) > 1024**3:
                    raise ValueError("invalid-upload-size")
                if headers.get("x-goog-upload-header-content-type") not in {"audio/mp4", "video/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "video/webm"}:
                    raise ValueError("unsupported-media-type")
            elif op == "poll":
                if body is not None:
                    raise ValueError("poll-body-refused")
                name = urllib.parse.urlsplit(url).path.removeprefix("/v1beta/")
                if not self.queue.collection.find_one(self.queue.scoped({"status": "done", "runId": doc["runId"],
                    "request.op": "upload-finalize", "response.body.file.name": name})):
                    raise ValueError("foreign-or-missing-provider-file")
            elif op == "generate":
                if headers != {"content-type": "application/json"} or not isinstance(body, dict) or set(body) != {"contents", "generationConfig"}:
                    raise ValueError("invalid-generate-envelope")
                parts = body.get("contents", [{}])[0].get("parts", [])
                if len(body["contents"]) != 1 or len(parts) != 2 or set(parts[0]) != {"text"} or not isinstance(parts[0]["text"], str) or len(parts[0]["text"]) > 8000 or set(parts[1]) != {"fileData"}:
                    raise ValueError("invalid-generate-parts")
                file_data = parts[1]["fileData"]
                if set(file_data) != {"mimeType", "fileUri"} or file_data["mimeType"] != "audio/mp4":
                    raise ValueError("invalid-generate-file")
                provider_url(file_data["fileUri"], "poll")
                if not self.queue.collection.find_one(self.queue.scoped({"status": "done", "runId": doc["runId"],
                    "request.op": "upload-finalize", "response.body.file.uri": file_data["fileUri"]})):
                    raise ValueError("foreign-or-missing-provider-file")
                if body["generationConfig"] != {"thinkingConfig": {"thinkingBudget": 0}}:
                    raise ValueError("unsupported-generation-config")
            data = json.dumps(body).encode() if body is not None else None
        result = self._http(url, method, headers, data)
        if op == "upload-start" and 200 <= result["status"] < 300:
            upload_url = result.pop("upload_url", None)
            if not upload_url:
                raise ValueError("provider-upload-handoff-missing")
            self.uploads[doc["_id"]] = {"url": upload_url,
                "binding": (doc["tenantId"], doc["runId"], doc["_id"], "upload-start")}
            result["headers"] = {"x-goog-upload-url": f"queue-upload://{doc['_id']}"}
        else:
            result.pop("upload_url", None)
        if len(json.dumps(result).encode()) > MAX_RESPONSE:
            raise ValueError("provider-response-oversized")
        return result
