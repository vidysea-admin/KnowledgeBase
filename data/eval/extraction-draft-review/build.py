"""Build source-bound AI draft batches; never writes source packets or gold labels."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
SOURCE = ROOT / "data/eval/extraction-adjudication-packet.json"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(path, data):
    write_preserving(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def write_preserving(path, text):
    expected = text.encode("utf-8")
    if path.exists():
        if path.read_bytes().replace(b"\r\n", b"\n") != expected:
            raise FileExistsError(f"Refusing to replace changed review artifact: {path}")
        return
    path.write_bytes(expected)


def main():
    packet_bytes = SOURCE.read_bytes()
    packet = json.loads(packet_bytes)
    ratings = []
    rating_bindings = []
    for name in ("ratings-01-24.json", "ratings-25-48.json", "ratings-49-72.json"):
        data = (OUT / name).read_bytes()
        ratings.extend(json.loads(data))
        rating_bindings.append({"path": name, "sha256": sha(data)})
    assert len(ratings) == len(packet["claims"]) == 72
    sessions = {s["sessionId"]: s for s in packet["sessions"]}
    packet_hash = sha(packet_bytes)
    bindings = {"path": "data/eval/extraction-adjudication-packet.json", "sha256": packet_hash}
    entries = []
    for ordinal, (claim, rating) in enumerate(zip(packet["claims"], ratings), 1):
        assert rating["ordinal"] == ordinal and rating["claimId"] == claim["claimId"]
        entries.append({
            "ordinal": ordinal, "claimId": claim["claimId"], "sessionId": claim["sessionId"],
            "sourcePacketSha256": packet_hash, "claimRecordSha256": claim["claimRecordSha256"],
            "sourceBindingSha256": sessions[claim["sessionId"]]["sourceBindingSha256"],
            "persistedClaim": claim["persistedClaim"],
            "literalCitationContexts": claim["literalCitationContexts"],
            "replacementProposal": claim["replacementProposal"],
            "aiDraft": {
                "status": "AI_DRAFT_REQUIRES_INDIVIDUAL_UMESH_APPROVAL",
                "literalCitationSupport": rating["literalSupport"],
                "literalRationale": rating["rationale"],
                "replacementCitationSupport": rating["replacementSupport"],
                "replacementRationale": rating["replacementRationale"],
                "factualTruth": "unknown", "omissions": "unknown",
                "topicPrecision": "unknown", "personPrecision": "unknown",
                "reviewBasis": "Current literal source passages only; replacement proposals rated separately. No full-transcript absence claim or external factual verification.",
            },
            "humanReview": {"status": "unreviewed", "approvedBy": None, "approvedAt": None,
                            "decision": None, "sourcePacketSha256": None},
            "humanGold": False, "bindingThresholds": None,
        })
    batch_bindings = []
    for start in range(0, 72, 10):
        number = start // 10 + 1
        batch_entries = entries[start:start + 10]
        ids = sorted({entry["sessionId"] for entry in batch_entries})
        batch = {"version": 1, "batch": number,
                 "status": "AI_DRAFT_REQUIRES_INDIVIDUAL_UMESH_APPROVAL",
                 "sourcePacket": bindings, "humanGold": False,
                 "sourceSessions": [sessions[sid] for sid in ids], "entries": batch_entries}
        filename = f"batch-{number:02d}.json"
        dump(OUT / filename, batch)
        batch_bindings.append({"path": filename, "sha256": sha((OUT / filename).read_bytes()),
                               "itemCount": len(batch_entries),
                               "firstOrdinal": start + 1, "lastOrdinal": start + len(batch_entries)})
        lines = [f"# Extraction draft review — batch {number:02d}", "",
                 "AI drafts only. Each item requires Umesh's individual review. No gold labels are granted.", "",
                 f"Source packet SHA-256: `{packet_hash}`", "",
                 "Read the paired JSON for complete current/historical source records, speaker/time fields and hashes.",
                 "Unsupported means these citations do not establish the claim; it does not mean the claim is false.", ""]
        for entry in batch_entries:
            draft = entry["aiDraft"]
            lines.extend([f"## {entry['ordinal']}. {entry['claimId']}", "",
                          entry["persistedClaim"]["text"], "",
                          f"Literal citations — **{draft['literalCitationSupport']}**: {draft['literalRationale']}"])
            if draft["replacementCitationSupport"] is not None:
                lines.append(f"Existing replacement proposal — **{draft['replacementCitationSupport']}**: {draft['replacementRationale']}")
            lines.extend(["", "Individual Umesh ruling: **unreviewed**. Approver/date/source-bound decision: pending.", ""])
        write_preserving(OUT / f"batch-{number:02d}.md", "\n".join(lines))
    counts = {label: sum(e["aiDraft"]["literalCitationSupport"] == label for e in entries)
              for label in ("supported", "partially_supported", "unsupported", "unavailable")}
    index = {"version": 1, "status": "AI_DRAFT_REQUIRES_INDIVIDUAL_UMESH_APPROVAL",
             "authorization": "D-163", "sourcePacket": bindings, "ratingInputs": rating_bindings,
             "batches": batch_bindings, "claimCount": 72, "literalCitationOccurrences": 80,
             "unresolvedReferences": packet["baseline"]["unresolvedReferences"],
             "draftLiteralSupportCounts": counts, "replacementProposalCount": 7,
             "humanGoldCount": 0, "semanticGoldAccepted": False, "bindingThresholds": None,
             "acceptance": "Review preparation only. U2.2 remains gated on individual human approvals, gold/threshold acceptance and complete-corpus evidence."}
    dump(OUT / "index.json", index)
    print(json.dumps({"claims": 72, "batches": len(batch_bindings), "counts": counts,
                      "humanGoldCount": 0, "sourcePacketSha256": packet_hash}))


if __name__ == "__main__":
    main()
