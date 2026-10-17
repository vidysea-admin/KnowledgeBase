from broker_lib import *
import os,shlex
phase=time.monotonic();temp=OUT/'t037-t056-temp';temp.mkdir(exist_ok=True);probe=temp/'owned-probe';probe.mkdir();(probe/'bytes').write_bytes(b'probe');assert (probe/'bytes').read_bytes()==b'probe';(probe/'bytes').unlink();probe.rmdir();os.environ.update(TMP=str(temp),TEMP=str(temp),KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
pre=run('t037-t056-preflight',[NODE,'--input-type=module','-e',"console.log(JSON.stringify({executable:process.execPath,version:process.version,tsx:import.meta.resolve('tsx')}))"],ROOT,10,{'pnpm-lock.yaml':sha(ROOT/'pnpm-lock.yaml')});assert pre.get('exit')==0;assert json.loads(pathlib.Path(pre['log']).read_text(encoding='utf-8'))['tsx'].startswith((ROOT/'node_modules').as_uri())
active=['apps/api/src/indexing/'+n for n in ['types.ts','session.ts','post-commit.ts','post-commit.test.ts','vectorless-publication.test.ts']]+['apps/api/src/composition/integrations/transcripts.ts','apps/api/src/grounded-postprocessing/transcripts.test.ts']
results=[]
p=ROOT/'qa/coordination/resume-20261015/t037-approved-trust/broker-request.json';r=load(p);pins={j['path']:j['sha256'] for j in load(r['pins'])['pins']};parts=shlex.split(r['command']);args=parts[1:];args.insert(0,'--test-isolation=none')
for i,a in enumerate(args):
 if i and args[i-1]=='--import' and a=='tsx':args[i]=(ROOT/'.cache/coordination/safe-test-runtime/register.mjs').as_uri()
tests=[(pathlib.Path(r['cwd'])/a).relative_to(ROOT).as_posix() for a in parts if a.endswith('.test.ts')];actual=closure(tests);pins.update(actual);pins['.cache/coordination/safe-test-runtime/register.mjs']=sha(ROOT/'.cache/coordination/safe-test-runtime/register.mjs')
results.append(run('t037-approved-trust13',[NODE,*args],r['cwd'],60,pins,active))
p=ROOT/'qa/coordination/resume-20261015/t056-direct-answer/broker-request.json';r=load(p);base=p.parent;expected={j['path']:j['sha256'].lower() for j in [*load(base/r['source_pins']),*load(base/r['dependency_pins'])]};parts=shlex.split(r['commands'][0]['command']);args=parts[1:];args.insert(0,'--test-concurrency=1');args.insert(0,'--test-isolation=none')
for i,a in enumerate(args):
 if i and args[i-1]=='--import' and a=='tsx':args[i]=(ROOT/'.cache/coordination/safe-test-runtime/register.mjs').as_uri()
actual=closure([a for a in parts if a.endswith('.test.ts')]);assert all(sha(ROOT/n)==v for n,v in expected.items()),'T056 candidate drift';expected.update(actual);expected['.cache/coordination/safe-test-runtime/register.mjs']=sha(ROOT/'.cache/coordination/safe-test-runtime/register.mjs')
authority={'authority':'root exact frozen readlease chunk-integrity.ts; only listed indexing/postcommit/transcripts files active','active_paths':active,'chunk_integrity_sha256':sha(ROOT/'apps/api/src/indexing/chunk-integrity.ts')};(OUT/'t056-exact-index-readlease.json').write_text(json.dumps(authority,indent=2))
results.append(run('t056-api-exact-readlease',[NODE,*args],ROOT,min(65,125-(time.monotonic()-phase)),expected,active))
(OUT/'t037-t056-followup-summary.json').write_text(json.dumps({'active_s':time.monotonic()-phase,'environment':{k:os.environ[k] for k in ['TMP','TEMP','KB_U24_PRIVATE_TOC_TESTS','T054_AUTHENTIC_INPUT_OPT_IN','LKB_WHATSAPP_CONSENT_MONGO_RUN']},'results':results,'actual_total_tokens':None},indent=2))
