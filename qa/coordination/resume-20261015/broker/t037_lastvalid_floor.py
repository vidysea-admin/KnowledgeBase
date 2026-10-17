from broker_lib import *
import os
temp=OUT/'t037-t056-temp';os.environ.update(TMP=str(temp),TEMP=str(temp),KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
packet=load('qa/coordination/resume-20261015/t037-approved-trust/pins.json');pins={j['path']:j['sha256'].lower() for j in packet['pins']};assert all(sha(ROOT/n)==v for n,v in pins.items()),'packet drift'
file='packages/meeting-bot/src/calendar/join-rules/join-rules-last-valid-enforce.test.ts';actual=closure([file]);pins.update(actual)
pattern='^(valid primary seeds snapshot; corruption/missing primary uses it without extending expiry|cached enforcement preserves previously rejected/cancelled selection and evaluator errors refuse)$'
args=[NODE,'--test','--test-isolation=none','--test-concurrency=1','--test-timeout=30000','--import',(ROOT/'.cache/coordination/safe-test-runtime/register.mjs').as_uri(),'--test-name-pattern='+pattern,file]
run('t037-lastvalid-floor2',args,ROOT,45,pins,['apps/api/src/indexing/types.ts','apps/api/src/indexing/session.ts','apps/api/src/indexing/post-commit.ts'])
