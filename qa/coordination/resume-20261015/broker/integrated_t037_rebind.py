from broker_lib import *
import os,shlex
phase=time.monotonic();pins=load('qa/coordination/resume-20261015/broker/integrated-freeze-inventory-before.json');assert all(sha(ROOT/n)==v for n,v in pins.items());packet=load('qa/coordination/resume-20261015/t037-approved-trust/pins.json');assert all(sha(ROOT/j['path'])==j['sha256'] for j in packet['pins']);pins.update({j['path']:j['sha256'] for j in packet['pins']});safe=(ROOT/'.cache/coordination/safe-test-runtime/register.mjs').as_uri();pins['.cache/coordination/safe-test-runtime/register.mjs']=sha(ROOT/'.cache/coordination/safe-test-runtime/register.mjs')
temp=OUT/'integrated-focused-temp';os.environ.update(TMP=str(temp),TEMP=str(temp),KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
r=load('qa/coordination/resume-20261015/t037-approved-trust/broker-request.json');args=shlex.split(r['command'])[1:];args.insert(0,'--test-isolation=none')
for i,a in enumerate(args):
 if i and args[i-1]=='--import' and a=='tsx':args[i]=safe
a=run('integrated-t037-current13',[NODE,*args],r['cwd'],45,pins)
pattern='^(valid primary seeds snapshot; corruption/missing primary uses it without extending expiry|cached enforcement preserves previously rejected/cancelled selection and evaluator errors refuse)$'
b=run('integrated-t037-current-lastvalid2',[NODE,'--test','--test-isolation=none','--test-concurrency=1','--test-timeout=30000','--import',safe,'--test-name-pattern='+pattern,'packages/meeting-bot/src/calendar/join-rules/join-rules-last-valid-enforce.test.ts'],ROOT,20,pins)
(OUT/'integrated-t037-current-summary.json').write_text(json.dumps({'authority':'root explicit current final freeze13+2 rerun; prior receipt mismatch kept historical','source_binding':'whole1649 final compiler/native inventory plus exact T037 packet pins, therefore includes current archive-spool even if optional runtime path does not execute','active_s':time.monotonic()-phase,'results':[a,b],'actual_total_tokens':None,'independent_verdict':None},indent=2))
