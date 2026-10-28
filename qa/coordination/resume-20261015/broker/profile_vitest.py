import pathlib,json,subprocess,time,os,hashlib
out=pathlib.Path(__file__).parent;root=out.parents[3];r=json.loads((root/'qa/coordination/resume-20261015/profile/broker-request.json').read_text());pins={j['path']:j['sha256'].lower() for j in r['source_pins']};pins[r['graph_dependency']['path']]=r['graph_dependency']['sha256'].lower()
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
rec={'old_vector':r['commands'][1]['command'],'new_vector':['C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe','node_modules/vitest/vitest.mjs','run','src/pages/knowledge/speakers/speakerProfileClient.test.ts','--pool=threads','--poolOptions.threads.singleThread'],'cwd':str(root/'apps/web'),'actual_total_tokens':None,'change':'installed local Vitest path; supported single thread options confirmed in local help; no test assertion changes'};start=time.monotonic()
try:
 rec['pins_before']={p:sha(root/p) for p in pins};assert rec['pins_before']==pins
 env=os.environ.copy();env.pop('KB_U24_PRIVATE_TOC_TESTS',None);env.update(T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0',TMP=str(out/'repaired-temp'),TEMP=str(out/'repaired-temp'))
 p=subprocess.run(rec['new_vector'],cwd=rec['cwd'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=30);(out/'profile-vitest.log').write_bytes(p.stdout);rec['exit']=p.returncode;rec['output_tail']=p.stdout.decode(errors='replace').splitlines()[-18:]
except subprocess.TimeoutExpired as e:(out/'profile-vitest.log').write_bytes(e.stdout or b'');rec['checkpoint']='external30s timeout'
except BaseException as e:rec['checkpoint']=type(e).__name__+': '+str(e)
finally:
 rec['pins_after']={p:sha(root/p) for p in pins};rec['pins_unchanged']=rec.get('pins_before')==rec['pins_after'];rec['active_s']=time.monotonic()-start;(out/'profile-vitest-receipt.json').write_text(json.dumps(rec,indent=2));print(json.dumps(rec,indent=2))
