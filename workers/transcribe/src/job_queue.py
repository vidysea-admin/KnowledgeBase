"""Tenant-scoped atomic claims and fenced publication for the shared jobs collection."""
import time
import uuid
from datetime import datetime, timezone
from pymongo import ReturnDocument
from schema_check import validate_document


def now_ms():
    return int(time.time() * 1000)


def iso():
    return datetime.now(timezone.utc).isoformat()


class JobQueue:
    def __init__(self, collection, tenant, lease_ms=30000):
        if not isinstance(tenant, str) or not tenant.strip() or len(tenant) > 200:
            raise ValueError("trusted tenant configuration required")
        if not 100 <= lease_ms <= 300000:
            raise ValueError("invalid lease duration")
        self.collection, self.tenant, self.lease_ms = collection, tenant, lease_ms

    def scoped(self, query):
        return {**query, "tenantId": self.tenant, "kind": "transcribe.rpc"}

    def claim(self):
        now = now_ms()
        expired = self.scoped({"status": {"$in": ["pending", "processing"]}, "$or": [
            {"deadlineMs": {"$lte": now}},
            {"status": "processing", "leaseUntilMs": {"$lte": now}, "$expr": {"$gte": ["$attempts", "$maxAttempts"]}}]})
        self.collection.update_many(expired, {"$set": {"status": "failed", "error": "deadline-or-attempts-exhausted", "updatedAt": iso()}})
        query = self.scoped({"deadlineMs": {"$gt": now}, "cancelledAt": {"$exists": False},
            "$expr": {"$lt": ["$attempts", "$maxAttempts"]},
            "$or": [{"status": "pending"}, {"status": "processing", "leaseUntilMs": {"$lte": now}}]})
        token = uuid.uuid4().hex
        doc = self.collection.find_one_and_update(query, {"$set": {"status": "processing", "claimToken": token,
            "leaseUntilMs": now + self.lease_ms, "updatedAt": iso()}, "$inc": {"attempts": 1}},
            sort=[("createdAt", 1)], return_document=ReturnDocument.AFTER)
        if doc:
            try:
                validate_document("jobs", doc)
                if doc.get("maxAttempts") not in (1, 2) or not isinstance(doc.get("attempts"), int):
                    raise ValueError("invalid retry policy")
            except Exception:
                self.finish(doc, error="invalid-job-contract")
                return None
        return doc

    def owned(self, doc):
        return self.scoped({"_id": doc["_id"], "status": "processing", "claimToken": doc["claimToken"],
            "leaseUntilMs": {"$gt": now_ms()}, "deadlineMs": {"$gt": now_ms()}, "cancelledAt": {"$exists": False}})

    def heartbeat(self, doc):
        return self.collection.update_one(self.owned(doc), {"$set": {"leaseUntilMs": now_ms() + self.lease_ms}}).modified_count == 1

    def finish(self, doc, response=None, error=None):
        update = {"status": "failed" if error else "done", "updatedAt": iso()}
        if error:
            update["error"] = error[:120]
        else:
            update["response"] = response
        candidate = {**doc, **update}
        validate_document("jobs", candidate)
        return self.collection.update_one(self.owned(doc), {"$set": update, "$unset": {"claimToken": "", "leaseUntilMs": ""}}).modified_count == 1

    def release(self, doc):
        # Process shutdown leaves a bounded recoverable lease; an old owner stays fenced.
        return self.collection.update_one(self.owned(doc), {"$set": {"leaseUntilMs": now_ms() - 1}}).modified_count == 1
