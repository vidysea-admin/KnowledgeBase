# Parallel extraction adjudication packet

**Handshake status:** checked-PASS
Status: checked-PASS
Fix cycle: 0
Task: U2.2 (review preparation only; full extraction acceptance remains BUILDING)
Priority: tier 3 roadmap continuation; existing enforcement/human gates remain with their owners.
Authorization: Umesh approved NORMAL mode and parallel work; root assigned only this packet and manifest, with independent checker.
Date: 2026-10-09

## Owned paths
- data/eval/extraction-adjudication-packet.json (new source-bound review preparation artifact)
- qa/manifests/parallel-extraction-adjudication.md (this request)
No other path is owned or written by this unit.

## Behavior and limits
Every one of the original 72 persisted claim rows is retained unchanged with all 80 literal citation occurrences. Current cited passages and historical migration passages are presented side by side, including speaker/time fields and exact text hashes. Current source artifacts bind exact byte hashes, LF-normalized hashes, and canonical source-binding hashes. Git historical blobs bind full revision/path/SHA identities; missing historical artifacts remain absent.
Seven independently reviewed replacement proposals remain proposals, with their original records and current literal supporting passages. The other 65 replacement reviews remain unreviewed. All 72 human semantic adjudications remain unreviewed, factual truth/omission/entity quality remain unknown, and no human gold label or numerical threshold is authored.
The packet is not an evaluator-compatible gold manifest; it is source material for independent human adjudication. No replacement citation is applied. Source files, runtime, DB, providers, schema, contracts, ledger, tasks and enforcement remain outside this unit.
Preparation is subject to final independent checker verdict; no full U2.2 completion is claimed.

## Budgets and loop
Read project AGENTS.md, ARCHITECTURE.md, structure.config.json, current QA queue and the extraction manifests/verdicts before building. QA queue enforcement items retain their named human gates. NORMAL mode is explicitly approved by Umesh for this assignment; no maker-only contract or enforcement edit is performed. Both owned files are data/QA artifacts outside configured code-root LOC/directory budgets. No new application source file or scripts-root capacity exception is used. No guards were bypassed.

## Derived coverage
35 declared cases; 32 current inventory directories; 29 loaded cases; 3,427 turns; 72 claims; 80 citation occurrences; 14 unresolved citation occurrences with all recorded identities retained; six missing-artifact cases; three invalid-time sessions; zero human adjudicated claims.
Three declared synthetic directories are currently absent: synthetic-cli-20260930, synthetic-production-cli-20260930, synthetic-production-interrupt-20260930. Three other synthetic directories exist but lack artifacts. No directory deletion was performed.
All 16 original artifact pins match after CRLF-to-LF normalization; zero match exact current Windows bytes. This is recorded as normalized agreement, not byte identity. Historical original-migration artifacts are available for 23 sessions (46 artifact hash checks); six migrated sessions lack those historical artifacts, and their provenance remains unresolved.

## Maker verification evidence
Bounded local JSON/hash readback and literal-record comparison only. No providers, browser, DB, full test suite or mutation harness.
Command executed from C:\Users\product\Desktop\KnowledgeBase, with installed C:\Program Files\Python312\python.exe resolved by python:

```powershell
@'
import subprocess,sys
code = "import json,hashlib,subprocess\nfrom pathlib import Path\nroot=Path.cwd(); packet_path=root/\"data/eval/extraction-adjudication-packet.json\"\npacket=json.loads(packet_path.read_bytes()); cache={}; historical={}; checks=0\ndef sha(b): return hashlib.sha256(b).hexdigest()\ndef canon(v): return json.dumps(v,sort_keys=True,separators=(\",\",\":\"),ensure_ascii=False).encode(\"utf-8\")\nfor descriptor in packet[\"inputs\"].values():\n    assert sha((root/descriptor[\"path\"]).read_bytes())==descriptor[\"sha256\"]; checks+=1\ncorpus=json.loads((root/packet[\"inputs\"][\"corpus\"][\"path\"]).read_bytes())\nreview=json.loads((root/packet[\"inputs\"][\"reviewedReplacementProposals\"][\"path\"]).read_bytes())\nfor session in packet[\"sessions\"]:\n    assert sha(canon(session[\"sourceBinding\"]))==session[\"sourceBindingSha256\"]\n    cache[session[\"sessionId\"]]={}\n    for kind,d in session[\"sourceBinding\"][\"artifacts\"].items():\n        b=(root/d[\"path\"]).read_bytes(); assert sha(b)==d[\"sha256\"]\n        assert sha(b.replace(b\"\\r\\n\",b\"\\n\"))==d[\"normalizedLfSha256\"]\n        cache[session[\"sessionId\"]][kind]=json.loads(b); checks+=1\n    historical[session[\"sessionId\"]]={}\n    for kind,d in session[\"historicalArtifacts\"].items():\n        r=subprocess.run([\"git\",\"show\",d[\"revision\"]+\":\"+d[\"path\"]],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=3)\n        assert bool(r.returncode==0)==d[\"available\"]\n        historical[session[\"sessionId\"]][kind]=json.loads(r.stdout) if d[\"available\"] else []\n        if d[\"available\"]: assert sha(r.stdout)==d[\"sha256\"]; checks+=1\ndef verify_context(context):\n    sid=context[\"sessionId\"]; tid=context[\"turnId\"]\n    for label,records in ((\"current\",cache[sid][\"turns\"]),(\"originalMigration\",historical[sid][\"turns\"])):\n        expected=[{\"record\":r,\"textSha256\":sha(r[\"text\"].encode(\"utf-8\"))} for r in records if r[\"_id\"]==tid]\n        assert context[label][\"matches\"]==expected\n        assert context[label][\"available\"]==bool(expected)\nclaims=packet[\"claims\"]; assert len(claims)==len({c[\"claimId\"] for c in claims})==72\nunresolved=[]; proposal_map={p[\"claimId\"]:p for p in review[\"mappings\"]}\nfor c in claims:\n    actual=next(r for r in cache[c[\"sessionId\"]][\"persisted\"] if r[\"_id\"]==c[\"claimId\"])\n    assert c[\"persistedClaim\"]==actual and c[\"claimRecordSha256\"]==sha(canon(actual))\n    assert c[\"claimTextSha256\"]==sha(actual[\"text\"].encode(\"utf-8\"))\n    assert c[\"historicalClaimRecords\"]==[r for r in historical[c[\"sessionId\"]][\"persisted\"] if r[\"_id\"]==c[\"claimId\"]]\n    assert [(x[\"sessionId\"],x[\"turnId\"]) for x in c[\"literalCitationContexts\"]]==[(e[\"sessionId\"],e[\"turnId\"]) for e in actual[\"evidence\"]]\n    for ctx in c[\"literalCitationContexts\"]:\n        verify_context(ctx)\n        if not ctx[\"current\"][\"available\"]: unresolved.append({\"sessionId\":c[\"sessionId\"],\"claimId\":c[\"claimId\"],\"turnId\":ctx[\"turnId\"]})\n    assert c[\"humanAdjudication\"]=={\"semanticSupport\":\"unreviewed\",\"factualTruth\":\"unknown\",\"omissions\":\"unknown\",\"topicPrecision\":\"unknown\",\"personPrecision\":\"unknown\",\"humanGold\":False,\"bindingThresholds\":None}\n    if c[\"replacementProposal\"]:\n        p=c[\"replacementProposal\"]; assert p[\"record\"]==proposal_map[c[\"claimId\"]]\n        assert p[\"record\"][\"claimText\"]==actual[\"text\"] and p[\"record\"][\"originalEvidence\"]==actual[\"evidence\"]\n        for ctx,e in zip(p[\"currentCitationContexts\"],p[\"record\"][\"proposedEvidence\"]):\n            verify_context(ctx); assert len(ctx[\"current\"][\"matches\"])==1\n            turn=ctx[\"current\"][\"matches\"][0]; assert turn[\"textSha256\"]==e[\"turnTextSha256\"]\n            assert all(turn[\"record\"][k]==e[k] for k in (\"tStart\",\"tEnd\",\"speakerRef\"))\nassert sorted(unresolved,key=canon)==sorted(corpus[\"baseline\"][\"unresolvedReferences\"],key=canon)==sorted(packet[\"baseline\"][\"unresolvedReferences\"],key=canon)\nassert set(packet[\"unreviewedReplacementClaimIds\"])==set(review[\"unreviewedClaimIds\"])=={c[\"claimId\"] for c in claims if not c[\"replacementProposal\"]}\nassert sum(len(c[\"literalCitationContexts\"]) for c in claims)==80 and len(unresolved)==14\nassert sum(bool(c[\"replacementProposal\"]) for c in claims)==7 and len(packet[\"unreviewedReplacementClaimIds\"])==65\nassert packet[\"semanticGold\"][\"labels\"]==[] and packet[\"semanticGold\"][\"bindingThresholds\"] is None\nactual_dirs=sorted(p.name for p in (root/packet[\"inventory\"][\"path\"]).iterdir() if p.is_dir())\nassert actual_dirs==packet[\"inventory\"][\"directories\"]\nassert len(packet[\"sessions\"])==29 and len(packet[\"acquisitionFailures\"])==6\nassert sum(len(v[\"turns\"]) for v in cache.values())==3427\nprint(json.dumps({\"PASS\":True,\"sourceArtifactHashChecks\":checks,\"claims\":72,\"citationOccurrences\":80,\"unresolvedIdentities\":14,\"reviewedProposals\":7,\"unreviewedReplacementClaims\":65,\"humanGoldLabels\":0,\"declaredCases\":35,\"currentInventoryDirectories\":len(actual_dirs),\"absentDeclaredDirectories\":packet[\"inventory\"][\"absentDeclaredDirectories\"],\"packetSha256\":sha(packet_path.read_bytes())},sort_keys=True))\n"
subprocess.run([sys.executable,'-c',code],timeout=20,check=True)
'@ | python -
```

Result: exit 0, wall time 5.0454836 seconds.
```json
{"PASS":true,"absentDeclaredDirectories":["synthetic-cli-20260930","synthetic-production-cli-20260930","synthetic-production-interrupt-20260930"],"citationOccurrences":80,"claims":72,"currentInventoryDirectories":32,"declaredCases":35,"humanGoldLabels":0,"packetSha256":"1cbc8cb5cf4894b72a9ac0a5ffff2a310cdf2da0c6d5811bcdadc66e2ca0b175","reviewedProposals":7,"sourceArtifactHashChecks":106,"unresolvedIdentities":14,"unreviewedReplacementClaims":65}
```

The 106 checks comprise two bound input files, 58 current artifact files and 46 available historical Git blobs. The verifier also compares all persisted claim rows, evidence order/multiplicity, historical claim records, current/historical cited passages, all seven reviewed proposal records/current quote hashes/time/speaker fields, the 65 unreviewed identities and original unresolved-reference corpus.
The verifier consumes the new packet immediately downstream as review preparation, without writing sources. Original evaluator replay remains outside this unit and its previously recorded incomplete quality result is unchanged.

## Independent checker request
Check all 72 claim records and 80 evidence occurrences against current bound originals; independently verify historical revision blobs/current passages, seven proposed replacements versus 65 unreviewed, missing/unknown status retention, input/hash bindings and all 14 recorded unresolved identities. Verdict path: qa/verdicts/parallel-extraction-adjudication.md, Cycle checked: 0. A PASS may close this review preparation unit only. Human gold, thresholds, initial extraction acceptance contract, real-corpus repair and full U2.2 remain open.

## Changes
Added only the packet and this manifest. No commit or push.

Independent closeout: qa/verdicts/parallel-extraction-adjudication.md VERDICT: PASS, Cycle checked: 0, preparation artifact only. Current packet SHA256 matches the independently checked 1cbc8cb5cf4894b72a9ac0a5ffff2a310cdf2da0c6d5811bcdadc66e2ca0b175. Full U2.2 human gold, binding thresholds and acceptance remain gated.
