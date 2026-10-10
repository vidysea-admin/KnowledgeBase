"""Bounded one-pass integrity aggregation of preliminary claim reviews; no source writes."""
import collections
import datetime
import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = pathlib.Path(__file__).resolve().parent
PACKET_HASH = '1cbc8cb5cf4894b72a9ac0a5ffff2a310cdf2da0c6d5811bcdadc66e2ca0b175'
LABELS = {'entailed', 'unsupported', 'contradicted', 'unresolvable'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))


def read_json(path):
    raw = path.read_bytes()
    return json.loads(raw), sha(raw)


def main():
    missing_reviews = [i for i in range(65) if not (BASE / 'results' / f'{i:02d}.json').is_file()]
    missing_audits = [i for i in range(13) if not (BASE / 'audits' / f'batch-{i:02d}.json').is_file()]
    if missing_reviews or missing_audits:
        print(json.dumps({'status': 'incomplete', 'reviewsPresent': 65-len(missing_reviews),
                          'auditsPresent': 13-len(missing_audits), 'missingReviewIndices': missing_reviews,
                          'missingAuditBatches': missing_audits}))
        return

    errors = []
    artifacts = {}
    rows = []
    reviews_by_index = {}
    tasks_by_index = {}
    original_counts = collections.Counter()
    current_counts = collections.Counter()
    source_context_count = collections.Counter()
    reviewer_verification_modes = collections.Counter()
    audit_original_counts = collections.Counter()
    audit_current_counts = collections.Counter()
    disagreements = []
    comparison_missing = []
    packet, packet_actual_hash = read_json(ROOT / 'data/eval/extraction-adjudication-packet.json')
    if packet_actual_hash != PACKET_HASH:
        errors.append({'scope': 'packet', 'error': 'packet byte hash differs from frozen input'})
    index, index_hash = read_json(BASE / 'index.json')
    expected_rows = sorted([(i,r) for i,r in enumerate(packet['claims']) if r['replacementReviewStatus']=='unreviewed'],
                           key=lambda value: value[1]['claimId'])
    if len(expected_rows) != 65 or len(index['tasks']) != 65 or index['packetSha256'] != PACKET_HASH:
        errors.append({'scope': 'index', 'error': 'expected65 filtered tasks or frozen packet binding mismatch'})

    def check(condition, scope, message):
        if not condition:
            errors.append({'scope': scope, 'error': message})

    def artifact_status(artifact, version):
        if not artifact or not artifact.get('path'):
            return None
        key = (artifact['path'], artifact.get('sha256'), artifact.get('revision'))
        if key in artifacts:
            return artifacts[key]
        status = {'path': artifact['path'], 'declaredSha256': artifact.get('sha256'),
                  'revision': artifact.get('revision'), 'contextVersion': version}
        if version == 'originalMigration':
            status['mode'] = 'provided-historical-context-only'
            status['reason'] = 'Historical Git artifact bytes were not read or independently verified by this aggregate.'
        else:
            target = (ROOT / artifact['path']).resolve()
            allowed = (ROOT / 'data/toc-migrated').resolve()
            if allowed not in target.parents:
                status['mode'] = 'refused-unapproved-source-path'
            elif not target.is_file():
                status['mode'] = 'current-artifact-missing'
            else:
                raw = target.read_bytes()
                status.update({'actualSha256': sha(raw), 'actualBytes': len(raw),
                               'mode': 'exact-current-artifact-bytes-verified' if sha(raw)==artifact.get('sha256') else 'current-artifact-hash-mismatch'})
        artifacts[key] = status
        return status

    for i, entry in enumerate(index['tasks']):
        scope = f'review:{i:02d}'
        task, task_hash = read_json(BASE / 'tasks' / f'{i:02d}.json')
        review, result_hash = read_json(BASE / 'results' / f'{i:02d}.json')
        original_index, original_row = expected_rows[i]
        check(entry['index']==i and task['index']==i and review.get('index')==i, scope, 'index mismatch')
        check(task_hash==entry['inputHash']==review.get('inputHash'), scope, 'task byte inputHash mismatch')
        check(task['claimId']==entry['claimId']==review.get('claimId')==original_row['claimId'], scope, 'claimId mismatch')
        check(task['originalIndex']==original_index==review.get('originalIndex'), scope, 'originalIndex mismatch')
        check(task['claim']==original_row, scope, 'task claim differs from original packet row')
        expected_sessions = [s for s in packet['sessions'] if all(s.get(k)==original_row.get(k) for k in ('caseId','tenantId','sessionId'))]
        check(len(expected_sessions)==1 and task['session']==expected_sessions[0],scope,'task session differs from original packet session')
        check(review.get('reviewType')=='AI-preliminary' and review.get('humanAdjudication') is None,
              scope, 'reviewType/human adjudication boundary mismatch')
        check(review.get('packetSha256')==PACKET_HASH and task['packetSha256']==PACKET_HASH, scope, 'packet hash binding mismatch')
        claim = task['claim']
        session = task['session']
        identity_ok = all(claim.get(key)==session.get(key) for key in ('caseId','tenantId','sessionId','sourceBindingSha256'))
        contexts = claim.get('literalCitationContexts', [])
        text_hash_ok = all(sha(match['record']['text'].encode('utf-8'))==match['textSha256']
                           for context in contexts for version in ('current','originalMigration')
                           for match in context.get(version,{}).get('matches',[]))
        computed_checks = {'claimRecordHash': canonical(claim['persistedClaim'])==claim['claimRecordSha256'],
                           'claimTextHash': sha(claim['persistedClaim']['text'].encode('utf-8'))==claim['claimTextSha256'],
                           'sourceBindingHash': canonical(session['sourceBinding'])==session['sourceBindingSha256'],
                           'identityBinding': identity_ok, 'contextTextHashes': text_hash_ok}
        for field,value in computed_checks.items():
            check(review.get('checks',{}).get(field) is value,scope,f'reviewer reported incorrect {field}')
            check(value,scope,f'frozen source input failed computed {field}')
        mode = review.get('checks',{}).get('artifactByteVerification','missing')
        reviewer_verification_modes[mode] += 1
        check(mode=='not-performed-provided-context-only', scope, 'reviewer artifact verification mode does not match task-only scope')
        check(review.get('sameIdContentChanged') is any(c.get('sameIdContentChanged',False) for c in contexts),
              scope, 'sameIdContentChanged summary mismatch')
        evidence_modes = []
        for context in contexts:
            for version in ('current','originalMigration'):
                block = context.get(version,{})
                source_context_count[f'{version}:available' if block.get('available') else f'{version}:unavailable'] += 1
                status = artifact_status(block.get('artifact'),version)
                if status:
                    evidence_modes.append(status)
        for side,version in (('original','originalMigration'),('current','current')):
            assessment = review.get(side,{})
            label = assessment.get('assessment')
            check(label in LABELS,scope,f'invalid {side} label')
            check(isinstance(assessment.get('reason'),str) and bool(assessment.get('reason')),scope,f'missing {side} reason')
            for field in ('missingReferences','caveats','citations'):
                check(isinstance(assessment.get(field),list),scope,f'{side}.{field} must be list')
            (original_counts if side=='original' else current_counts)[str(label)] += 1
            if label=='entailed':
                check(all(computed_checks.values()),scope,f'{side} entailed despite failed input hash/binding')
            for citation in assessment.get('citations',[]):
                candidates = [(context,match) for context in contexts
                              if context.get('sessionId')==citation.get('sessionId') and context.get('turnId')==citation.get('turnId')
                              for match in context.get(version,{}).get('matches',[])
                              if canonical(match['record'])==citation.get('contextSha256')]
                check(citation.get('contextVersion')==version,scope,f'{side} citation version mismatch')
                check(bool(candidates),scope,f'{side} citation hash/source reference missing from task')
                if not candidates:
                    continue
                context, match = candidates[0]
                record = match['record']
                quote = citation.get('quote','')
                check(isinstance(quote,str) and bool(quote) and quote in record['text'],scope,f'{side} quote is not exact contiguous supplied text')
                check(len(quote.split())<=40,scope,f'{side} quote exceeds40words')
                check(citation.get('textSha256')==match['textSha256']==sha(record['text'].encode('utf-8')),
                      scope,f'{side} citation text hash mismatch')
                artifact = context.get(version,{}).get('artifact',{})
                check(citation.get('artifactSha256')==artifact.get('sha256'),scope,f'{side} artifact hash mismatch')
                check(citation.get('revision')==artifact.get('revision'),scope,f'{side} artifact revision mismatch')
                for field in ('speakerRef','tStart','tEnd'):
                    check(citation.get(field)==record.get(field),scope,f'{side} citation {field} differs from exact record')
        reviews_by_index[i] = review
        tasks_by_index[i] = task
        rows.append({'index':i,'claimId':claim['claimId'],'originalIndex':original_index,
                     'inputHash':task_hash,'resultSha256':result_hash,'sourceBindingSha256':claim['sourceBindingSha256'],
                     'claimRecordSha256':claim['claimRecordSha256'],'claimTextSha256':claim['claimTextSha256'],
                     'originalReview':review,'computedInputChecks':computed_checks,'sourceArtifactVerification':evidence_modes,
                     'independentAudits':[]})

    audits = []
    audited_indices = []
    for batch in range(13):
        scope = f'audit:{batch:02d}'
        audit, audit_hash = read_json(BASE / 'audits' / f'batch-{batch:02d}.json')
        check(audit.get('schemaVersion')==1 and audit.get('batch')==batch,scope,'audit schemaVersion/batch mismatch')
        check(audit.get('reviewType')=='AI-preliminary-independent-audit' and audit.get('humanAdjudication') is None,
              scope,'audit reviewType/human boundary mismatch')
        entries = audit.get('entries',[])
        expected = list(range(batch*5,batch*5+5))
        check(sorted(e.get('index',-1) for e in entries)==expected,scope,'audit five-index coverage mismatch')
        for audited in entries:
            i = audited.get('index')
            if i not in reviews_by_index:
                check(False,scope,'audit index outside0..64'); continue
            audited_indices.append(i)
            review = reviews_by_index[i]
            check(audited.get('claimId')==review['claimId'] and audited.get('inputHash')==review['inputHash'],
                  scope,f'audit input binding mismatch at{i}')
            for field in ('originalLabel','currentLabel'):
                check(audited.get(field) in LABELS,scope,f'invalid audit {field} at{i}')
            audit_original_counts[str(audited.get('originalLabel'))] += 1
            audit_current_counts[str(audited.get('currentLabel'))] += 1
            different = {'original':audited.get('originalLabel')!=review['original']['assessment'],
                         'current':audited.get('currentLabel')!=review['current']['assessment']}
            recorded = audited.get('disagreements')
            if any(different.values()) or recorded:
                disagreements.append({'index':i,'claimId':review['claimId'],'labelDifferences':different,
                                      'reviewerLabels':{'original':review['original']['assessment'],'current':review['current']['assessment']},
                                      'auditorLabels':{'original':audited.get('originalLabel'),'current':audited.get('currentLabel')},
                                      'recordedDisagreements':recorded,'auditEntry':audited})
            rows[i]['independentAudits'].append({'batch':batch,'auditSha256':audit_hash,'entry':audited})
            reported_reviewer = audited.get('reviewerLabels')
            expected_reviewer = {'original':review['original']['assessment'],'current':review['current']['assessment']}
            normalized_reviewer = {} if not isinstance(reported_reviewer,dict) else {
                'original':reported_reviewer.get('original',reported_reviewer.get('originalLabel')),
                'current':reported_reviewer.get('current',reported_reviewer.get('currentLabel'))}
            if normalized_reviewer != expected_reviewer:
                comparison_missing.append({'batch':batch,'index':i,'reportedReviewerLabels':reported_reviewer,
                                           'expectedReviewerLabels':expected_reviewer})
            if isinstance(reported_reviewer,dict):
                if 'inputHash' in reported_reviewer:
                    check(reported_reviewer['inputHash']==review['inputHash'],scope,f'audit reviewer inputHash mismatch at{i}')
                if 'resultSha256' in reported_reviewer:
                    check(reported_reviewer['resultSha256']==rows[i]['resultSha256'],scope,f'audit reviewer resultSha256 mismatch at{i}')
            check('agreement' in audited and 'disagreements' in audited,scope,f'missing comparison fields at{i}')
            check(isinstance(audited.get('evidenceHashes'),dict),scope,f'missing evidenceHashes at{i}')
            hashes = audited.get('evidenceHashes',{})
            for field,expected_hash in [('inputHash',review['inputHash']),
                                        ('claimRecordSha256',rows[i]['claimRecordSha256']),
                                        ('claimTextSha256',rows[i]['claimTextSha256']),
                                        ('sourceBindingSha256',rows[i]['sourceBindingSha256'])]:
                if field in hashes:
                    check(hashes[field]==expected_hash,scope,f'audit evidence {field} mismatch at{i}')
            for field in ('taskBytesSha256','expectedInputHash'):
                if field in hashes:
                    check(hashes[field]==review['inputHash'],scope,f'audit {field} mismatch at{i}')
            for field in ('reviewerResultSha256','reviewerResultBytesSha256'):
                if field in hashes:
                    check(hashes[field]==rows[i]['resultSha256'],scope,f'audit {field} mismatch at{i}')
            for reported_context in hashes.get('contexts',[]):
                version = reported_context.get('contextVersion',reported_context.get('version'))
                version = 'originalMigration' if version=='original' else version
                task_contexts = tasks_by_index[i]['claim']['literalCitationContexts']
                bound = [c for c in task_contexts if c['turnId']==reported_context.get('turnId')]
                check(version in ('current','originalMigration') and len(bound)==1,scope,f'audit context identity/version mismatch at{i}')
                if version not in ('current','originalMigration') or len(bound)!=1:
                    continue
                block = bound[0].get(version,{})
                artifact = block.get('artifact',{})
                if 'available' in reported_context:
                    check(reported_context['available']==block.get('available'),scope,f'audit availability mismatch at{i}')
                for field in ('artifactSha256','providedArtifactSha256','artifactRawSha256','artifactSha256Provided'):
                    if field in reported_context:
                        check(reported_context[field]==artifact.get('sha256'),scope,f'audit {field} mismatch at{i}')
                for field in ('normalizedLfSha256','providedNormalizedLfSha256','normalizedLfSha256Provided','artifactNormalizedLfSha256'):
                    if field in reported_context:
                        check(reported_context[field]==artifact.get('normalizedLfSha256'),scope,f'audit {field} mismatch at{i}')
                for field in ('revision','providedRevision','revisionProvided'):
                    if field in reported_context:
                        check(reported_context[field]==artifact.get('revision'),scope,f'audit {field} mismatch at{i}')
                flattened = reported_context.get('matches',reported_context.get('records',[reported_context]))
                for reported_match in flattened:
                    digest = reported_match.get('contextSha256')
                    if digest is None:
                        check(not block.get('matches'),scope,f'audit omits available context record digest at{i}')
                        continue
                    source_matches = [m for m in block.get('matches',[]) if canonical(m['record'])==digest]
                    check(bool(source_matches),scope,f'audit contextSha256 absent from task at{i}')
                    if not source_matches:
                        continue
                    match = source_matches[0]
                    for field in ('textSha256','providedTextSha256'):
                        if field in reported_match:
                            check(reported_match[field]==match['textSha256'],scope,f'audit {field} mismatch at{i}')
                    for field in ('speakerRef','tStart','tEnd'):
                        if field in reported_match:
                            check(reported_match[field]==match['record'].get(field),scope,f'audit {field} mismatch at{i}')
                    if 'quote' in reported_match:
                        quote = reported_match['quote']
                        check(isinstance(quote,str) and quote in match['record']['text'] and len(quote.split())<=40,
                              scope,f'audit quote literal/word-limit mismatch at{i}')
        audits.append({'path':f'qa/evidence/parallel-claim-review/audits/batch-{batch:02d}.json',
                       'sha256':audit_hash,'audit':audit})
    check(sorted(audited_indices)==list(range(65)),'audit:coverage','every claim must be audited exactly once')
    if comparison_missing:
        print(json.dumps({'status':'incomplete-comparisons','reviewsPresent':65,'auditsPresent':13,
                          'completedComparisons':65-len(comparison_missing),'missingComparisons':comparison_missing,
                          'integrityErrors':errors},ensure_ascii=False))
        return
    artifact_list = list(artifacts.values())
    artifact_modes = dict(collections.Counter(a['mode'] for a in artifact_list))
    for artifact in artifact_list:
        if artifact['mode'] in ('refused-unapproved-source-path','current-artifact-missing','current-artifact-hash-mismatch'):
            errors.append({'scope':'artifact','error':artifact['mode'],'path':artifact['path']})
    summary = {'reviewCount':len(rows),'auditCount':len(audits),'auditEntryCount':len(audited_indices),
               'coverageComplete':len(rows)==65 and sorted(audited_indices)==list(range(65)),
               'completedComparisons':65,
               'integrityErrorCount':len(errors),'integrityValid':not errors,
               'primaryLabels':{'original':dict(original_counts),'current':dict(current_counts)},
               'independentLabels':{'original':dict(audit_original_counts),'current':dict(audit_current_counts)},
               'disagreementRows':len(disagreements),'reviewerArtifactVerificationModes':dict(reviewer_verification_modes),
               'semanticLabelDisagreementRows':sum(any(d['labelDifferences'].values()) for d in disagreements),
               'retainedComparisonHistoryRows':sum(not any(d['labelDifferences'].values()) for d in disagreements),
               'suppliedSourceContextCounts':dict(source_context_count),'uniqueArtifactVerificationModes':artifact_modes}
    aggregate = {'schemaVersion':1,'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                 'reviewType':'AI-preliminary-aggregate','humanAdjudication':None,'semanticGold':False,
                 'bindingThresholds':None,'packetPath':'data/eval/extraction-adjudication-packet.json',
                 'packetSha256':PACKET_HASH,'actualPacketSha256':packet_actual_hash,'indexSha256':index_hash,
                 'summary':summary,'integrityErrors':errors,'disagreements':disagreements,'claims':rows,'audits':audits,
                 'sourceArtifactVerification':artifact_list,
                 'limits':['Primary reviewers saw provided contexts only; their hash checks establish internal bindings, not source-byte inspection.',
                           'Aggregate verifies exact current source artifact bytes once per unique path/hash; historical artifact bytes remain provided context only.',
                           'All primary and independent semantic labels/reasons/citations/time and identity caveats are retained without consensus substitution.',
                           'AI preliminary transcript support establishes neither external factual truth nor human gold, thresholds, source repair, checker PASS or product acceptance.']}
    target = BASE / 'aggregate.json'
    target.write_text(json.dumps(aggregate,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    manifest = ROOT / 'qa/manifests/parallel-claim-evidence-review.md'
    text = manifest.read_text(encoding='utf-8').replace('Status: BUILDING','Status: ready-for-check',1).replace('Handshake status: BUILDING','Handshake status: ready-for-check',1)
    text = text.split('\n## Aggregate candidate evidence (Fix cycle0)')[0]
    text += '\n## Aggregate candidate evidence (Fix cycle0)\n'
    text += '- Command: `.venv\\Scripts\\python.exe qa/evidence/parallel-claim-review/aggregate.py` (bounded one pass; source reads only).\n'
    text += '- Literal output: `'+json.dumps(summary,ensure_ascii=False,sort_keys=True)+'`.\n'
    text += '- Aggregate: qa/evidence/parallel-claim-review/aggregate.json; SHA256 '+sha(target.read_bytes())+'.\n'
    text += '- Integrity findings and all audit disagreements are retained for the independent checker; no semantic gold or source statuses changed. No checker PASS is claimed.\n'
    manifest.write_text(text,encoding='utf-8')
    print(json.dumps({'status':'ready-for-check','aggregatePath':str(target),'summary':summary,'integrityErrors':errors},ensure_ascii=False))


if __name__ == '__main__':
    main()
