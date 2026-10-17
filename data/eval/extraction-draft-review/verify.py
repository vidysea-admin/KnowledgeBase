"""Bounded offline downstream verification of draft corpus identity and non-promotion."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(data):
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def main():
    index = json.loads((OUT / "index.json").read_bytes())
    source_bytes = (ROOT / index["sourcePacket"]["path"]).read_bytes()
    assert sha(source_bytes) == index["sourcePacket"]["sha256"]
    source = json.loads(source_bytes)
    sessions = {s["sessionId"]: s for s in source["sessions"]}
    assert len(index["batches"]) == 8
    entries = []
    for descriptor in index["batches"]:
        data = (OUT / descriptor["path"]).read_bytes()
        assert sha(data) == descriptor["sha256"]
        batch = json.loads(data)
        assert batch["sourcePacket"] == index["sourcePacket"]
        assert batch["status"] == index["status"] and batch["humanGold"] is False
        assert len(batch["entries"]) == descriptor["itemCount"] <= 10
        assert batch["sourceSessions"] == [sessions[sid] for sid in sorted({e["sessionId"] for e in batch["entries"]})]
        entries.extend(batch["entries"])
    assert len(entries) == len({e["claimId"] for e in entries}) == 72
    assert [e["claimId"] for e in entries] == [c["claimId"] for c in source["claims"]]
    ratings = []
    for descriptor in index["ratingInputs"]:
        data = (OUT / descriptor["path"]).read_bytes()
        assert sha(data) == descriptor["sha256"]
        ratings.extend(json.loads(data))
    assert len(ratings) == 72
    unresolved = []
    for ordinal, (entry, claim, rating) in enumerate(zip(entries, source["claims"], ratings), 1):
        assert entry["ordinal"] == rating["ordinal"] == ordinal
        assert entry["claimId"] == rating["claimId"]
        for key in ("persistedClaim", "literalCitationContexts", "replacementProposal", "claimRecordSha256"):
            assert entry[key] == claim[key]
        assert sha(canonical(entry["persistedClaim"])) == entry["claimRecordSha256"]
        assert entry["sourceBindingSha256"] == sessions[entry["sessionId"]]["sourceBindingSha256"]
        assert entry["sourcePacketSha256"] == index["sourcePacket"]["sha256"]
        assert entry["humanGold"] is False and entry["bindingThresholds"] is None
        assert entry["humanReview"] == {"status": "unreviewed", "approvedBy": None, "approvedAt": None,
                                       "decision": None, "sourcePacketSha256": None}
        draft = entry["aiDraft"]
        assert draft["status"] == index["status"]
        assert draft["literalCitationSupport"] == rating["literalSupport"]
        assert draft["literalRationale"] == rating["rationale"]
        assert draft["replacementCitationSupport"] == rating["replacementSupport"]
        assert draft["replacementRationale"] == rating["replacementRationale"]
        assert draft["literalCitationSupport"] in {"supported", "partially_supported", "unsupported", "unavailable"}
        assert all(draft[key] == "unknown" for key in ("factualTruth", "omissions", "topicPrecision", "personPrecision"))
        for context in entry["literalCitationContexts"]:
            if not context["current"]["available"]:
                unresolved.append({"sessionId": entry["sessionId"], "claimId": entry["claimId"], "turnId": context["turnId"]})
    assert sorted(unresolved, key=canonical) == sorted(index["unresolvedReferences"], key=canonical)
    assert sorted(unresolved, key=canonical) == sorted(source["baseline"]["unresolvedReferences"], key=canonical)
    assert len(unresolved) == 14
    assert sum(len(e["literalCitationContexts"]) for e in entries) == index["literalCitationOccurrences"] == 80
    assert sum(e["replacementProposal"] is not None for e in entries) == index["replacementProposalCount"] == 7
    assert dict(Counter(e["aiDraft"]["literalCitationSupport"] for e in entries)) == index["draftLiteralSupportCounts"]
    assert index["humanGoldCount"] == 0 and index["semanticGoldAccepted"] is False and index["bindingThresholds"] is None
    artifact_checks = 0
    for session in source["sessions"]:
        assert sha(canonical(session["sourceBinding"])) == session["sourceBindingSha256"]
        for kind, descriptor in session["sourceBinding"]["artifacts"].items():
            data = (ROOT / descriptor["path"]).read_bytes()
            assert sha(data) == descriptor["sha256"], descriptor["path"]
            assert sha(data.replace(b"\r\n", b"\n")) == descriptor["normalizedLfSha256"]
            artifact_checks += 1
            if kind == "turns":
                turns = json.loads(data)
                for entry in entries:
                    if entry["sessionId"] != session["sessionId"]:
                        continue
                    contexts = list(entry["literalCitationContexts"])
                    if entry["replacementProposal"] is not None:
                        contexts.extend(entry["replacementProposal"]["currentCitationContexts"])
                    for context in contexts:
                        matches = [{"record": t, "textSha256": sha(t["text"].encode("utf-8"))}
                                   for t in turns if t["_id"] == context["turnId"]]
                        assert matches == context["current"]["matches"]
    print(json.dumps({"PASS": True, "claims": 72, "citationOccurrences": 80,
                      "unresolvedReferences": 14, "replacementProposals": 7,
                      "batches": 8, "currentArtifactHashChecks": artifact_checks,
                      "humanGoldLabels": 0, "draftCounts": index["draftLiteralSupportCounts"],
                      "indexSha256": sha((OUT / "index.json").read_bytes())}, sort_keys=True))


if __name__ == "__main__":
    main()
