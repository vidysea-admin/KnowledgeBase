"""Independent bounded checker for D-163 draft-only review preparation."""
import copy
import hashlib
import json
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/eval/extraction-draft-review'
ORIGINAL = '1cbc8cb5cf4894b72a9ac0a5ffff2a310cdf2da0c6d5811bcdadc66e2ca0b175'
GOLDEN = '44432ab2717ba807a4ed066d346280156f4a671d172524f1ab009b116811677e'

def sha(b):
    return hashlib.sha256(b).hexdigest()

def canon(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()

def gate(entry):
    assert entry['humanGold'] is False
    assert entry['bindingThresholds'] is None
    assert entry['humanReview'] == dict(status='unreviewed', approvedBy=None, approvedAt=None,
                                        decision=None, sourcePacketSha256=None)
    d = entry['aiDraft']
    assert d['status'] == 'AI_DRAFT_REQUIRES_INDIVIDUAL_UMESH_APPROVAL'
    assert all(d[k] == 'unknown' for k in ('factualTruth', 'omissions', 'topicPrecision', 'personPrecision'))

def main():
    source_bytes = (ROOT / 'data/eval/extraction-adjudication-packet.json').read_bytes()
    assert sha(source_bytes) == ORIGINAL
    assert sha((ROOT / 'data/eval/golden-set-human-review.json').read_bytes()) == GOLDEN
    source = json.loads(source_bytes)
    index = json.loads((OUT / 'index.json').read_bytes())
    assert index['sourcePacket'] == {'path': 'data/eval/extraction-adjudication-packet.json', 'sha256': ORIGINAL}
    assert index['authorization'] == 'D-163'
    assert index['humanGoldCount'] == 0 and index['semanticGoldAccepted'] is False and index['bindingThresholds'] is None
    assert index['claimCount'] == 72 and len(index['batches']) == 8
    sessions = {s['sessionId']: s for s in source['sessions']}
    artifacts = {}
    for s in sessions.values():
        assert sha(canon(s['sourceBinding'])) == s['sourceBindingSha256']
        artifacts[s['sessionId']] = {}
        for k, descriptor in s['sourceBinding']['artifacts'].items():
            raw = (ROOT / descriptor['path']).read_bytes()
            assert len(raw) == descriptor['bytes'] and sha(raw) == descriptor['sha256']
            assert sha(raw.replace(b'\r\n', b'\n')) == descriptor['normalizedLfSha256']
            artifacts[s['sessionId']][k] = json.loads(raw)
    all_entries = []
    for n, descriptor in enumerate(index['batches'], 1):
        assert descriptor['path'] == f'batch-{n:02}.json'
        raw = (OUT / descriptor['path']).read_bytes()
        assert sha(raw) == descriptor['sha256']
        batch = json.loads(raw)
        assert batch['batch'] == n and batch['sourcePacket'] == index['sourcePacket']
        assert batch['humanGold'] is False and batch['status'] == index['status']
        expected_size = 10 if n < 8 else 2
        assert len(batch['entries']) == descriptor['itemCount'] == expected_size
        assert descriptor['firstOrdinal'] == (n - 1) * 10 + 1
        assert descriptor['lastOrdinal'] == (n - 1) * 10 + expected_size
        assert batch['sourceSessions'] == [sessions[sid] for sid in sorted({e['sessionId'] for e in batch['entries']})]
        md = (OUT / f'batch-{n:02}.md').read_text(encoding='utf-8')
        assert md.count('Individual Umesh ruling: **unreviewed**.') == expected_size
        assert 'AI drafts only.' in md and ORIGINAL in md
        for e in batch['entries']:
            assert e['persistedClaim']['text'] in md
            assert e['aiDraft']['literalRationale'] in md
            assert f"**{e['aiDraft']['literalCitationSupport']}**" in md
            if e['replacementProposal']:
                assert e['aiDraft']['replacementRationale'] in md
        all_entries.extend(batch['entries'])
    assert [e['claimId'] for e in all_entries] == [c['claimId'] for c in source['claims']]
    assert len({e['claimId'] for e in all_entries}) == 72
    refs, passages, replacements = [], 0, 0
    for ordinal, (e, c) in enumerate(zip(all_entries, source['claims']), 1):
        gate(e)
        assert e['ordinal'] == ordinal and e['sourcePacketSha256'] == ORIGINAL
        for k in ('claimId', 'sessionId', 'persistedClaim', 'claimRecordSha256', 'literalCitationContexts', 'replacementProposal'):
            assert e[k] == c[k]
        assert sha(canon(e['persistedClaim'])) == e['claimRecordSha256']
        s = sessions[e['sessionId']]
        assert e['sourceBindingSha256'] == s['sourceBindingSha256']
        persisted = [x for x in artifacts[e['sessionId']]['persisted'] if x['_id'] == e['claimId']]
        assert persisted == [e['persistedClaim']]
        literal = e['literalCitationContexts']
        assert [(x['sessionId'], x['turnId']) for x in literal] == [(x['sessionId'], x['turnId']) for x in persisted[0]['evidence']]
        contexts = list(literal)
        d = e['aiDraft']
        assert d['literalCitationSupport'] in {'supported', 'partially_supported', 'unsupported', 'unavailable'}
        assert bool(d['literalRationale'])
        if e['replacementProposal']:
            replacements += 1
            contexts += e['replacementProposal']['currentCitationContexts']
            assert d['replacementCitationSupport'] == 'supported' and d['replacementRationale']
        else:
            assert d['replacementCitationSupport'] is None and d['replacementRationale'] is None
        for x in literal:
            if not x['current']['available']:
                refs.append(dict(sessionId=e['sessionId'], claimId=e['claimId'], turnId=x['turnId']))
        assert (d['literalCitationSupport'] == 'unavailable') == all(not x['current']['available'] for x in literal)
        for x in contexts:
            sid = x['sessionId']
            turns = [t for t in artifacts[sid]['turns'] if t['_id'] == x['turnId']]
            assert x['current']['artifact'] == sessions[sid]['sourceBinding']['artifacts']['turns']
            assert x['current']['matches'] == [{'record': t, 'textSha256': sha(t['text'].encode())} for t in turns]
            assert x['current']['available'] == bool(turns)
            passages += len(turns)
    assert len(refs) == 14 and refs == index['unresolvedReferences'] == source['baseline']['unresolvedReferences']
    assert replacements == index['replacementProposalCount'] == 7
    assert sum(len(e['literalCitationContexts']) for e in all_entries) == index['literalCitationOccurrences'] == 80
    assert Counter(e['aiDraft']['literalCitationSupport'] for e in all_entries) == index['draftLiteralSupportCounts']
    probes = 0
    for key, value in [('humanGold', True), ('bindingThresholds', {'accept': .8})]:
        bad = copy.deepcopy(all_entries[0]); bad[key] = value
        try: gate(bad)
        except AssertionError: probes += 1
        else: raise AssertionError('promotion accepted')
    for key, value in [('approvedBy', 'Umesh'), ('decision', 'approved'), ('status', 'approved')]:
        bad = copy.deepcopy(all_entries[0]); bad['humanReview'][key] = value
        try: gate(bad)
        except AssertionError: probes += 1
        else: raise AssertionError('approval accepted')
    print(json.dumps({'PASS': True, 'claims': 72, 'literalOccurrences': 80, 'unresolved': 14,
                      'replacements': 7, 'batches': 8, 'artifactByteChecks': sum(len(v) for v in artifacts.values()),
                      'currentPassageMatches': passages, 'humanGold': 0, 'promotionProbesRefused': probes,
                      'indexSha256': sha((OUT / 'index.json').read_bytes())}, sort_keys=True))

if __name__ == '__main__':
    main()
