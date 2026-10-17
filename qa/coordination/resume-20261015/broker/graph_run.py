import json, pathlib, subprocess, time, os, hashlib, re
out=pathlib.Path(__file__).parent; root=out.parents[3]
p=root/'qa/coordination/resume-20261015/graph/broker-request.json'; r=json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
t=time.monotonic(); rec={'request_sha256':sha(p),'actual_total_tokens':None,'authority':'broker evidence only'}
try:
 before={k:sha(root/k) for k in r['pins']}; rec['pins_before']=before
 assert before==r['pins'],'frozen pin drift'
 env=os.environ.copy(); env.update(r['env']); env['T054_AUTHENTIC_INPUT_OPT_IN']='0'; env['LKB_WHATSAPP_CONSENT_MONGO_RUN']='0'
 temp=out/'graph-temp'; temp.mkdir(exist_ok=True); probe=temp/'probe'; probe.mkdir(); (probe/'bytes').write_bytes(b'x'); assert (probe/'bytes').read_bytes()==b'x'; (probe/'bytes').unlink(); probe.rmdir()
 env['TEMP']=env['TMP']=str(temp)
 pre=subprocess.run([r['program'],'--input-type=module','-e',"console.log(JSON.stringify({executable:process.execPath,version:process.version,tsx:import.meta.resolve('tsx')}))"],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=10)
 (out/'graph-preflight.log').write_bytes(pre.stdout); rec['preflight_exit']=pre.returncode; rec['runtime_sha256']=sha(pathlib.Path(r['program']))
 assert pre.returncode==0; assert json.loads(pre.stdout)['tsx'].startswith((root/'node_modules').as_uri())
 s=time.monotonic(); run=subprocess.run([r['program'],*r['args']],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=r['timeoutMs']/1000)
 (out/'graph.log').write_bytes(run.stdout); txt=run.stdout.decode(errors='replace')
 rec.update(exit=run.returncode,command=[r['program'],*r['args']],duration_s=time.monotonic()-s,counts={k:int(v) for k,v in re.findall(r'(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)',txt)})
except BaseException as e:rec['checkpoint']=type(e).__name__+': '+str(e)
finally:
 rec['pins_after']={k:sha(root/k) for k in r['pins']}; rec['pins_unchanged']=rec.get('pins_before')==rec['pins_after']; rec['active_s']=time.monotonic()-t
 (out/'graph-receipt.json').write_text(json.dumps(rec,indent=2)); print(json.dumps(rec,indent=2))
