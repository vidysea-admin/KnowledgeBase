import json,pathlib,hashlib,subprocess,time,os,re
out=pathlib.Path(__file__).parent; root=out.parents[3]; r=json.loads((root/'qa/coordination/resume-20261015/capture/broker-request.json').read_text()); packet=json.loads(pathlib.Path(r['packet']).read_text())
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
rec={'actual_total_tokens':None,'authority':'broker maker evidence only','commands':[]}; start=time.monotonic()
pins={f['path']:f['sha256'].lower() for f in packet['unit']['files']}
try:
 rec['pins_before']={p:sha(p) for p in pins}; assert rec['pins_before']==pins,'pin drift'
 env=os.environ.copy(); env.update(r['environment']); env.update(KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0')
 temp=out/'capture-temp'; temp.mkdir(exist_ok=True); p=temp/'probe'; p.mkdir(); (p/'bytes').write_bytes(b'x'); assert (p/'bytes').read_bytes()==b'x'; (p/'bytes').unlink(); p.rmdir(); env['TMP']=env['TEMP']=str(temp)
 job=r['preflight'][1]; s=time.monotonic(); result=subprocess.run([job['executable'],*job['args']],cwd=job['cwd'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=20); (out/'capture-preflight.log').write_bytes(result.stdout); rec['preflight_exit']=result.returncode; rec['python_sha256']=sha(job['executable']); assert result.returncode==0
 job=r['commands'][0]; assert not pathlib.Path(job['args'][-1]).exists(),'basetemp already exists'
 s=time.monotonic(); result=subprocess.run([job['executable'],*job['args']],cwd=job['cwd'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=45); (out/'capture-python.log').write_bytes(result.stdout)
 rec['commands'].append({'command':[job['executable'],*job['args']],'exit':result.returncode,'duration_s':time.monotonic()-s,'summary':result.stdout.decode(errors='replace').splitlines()[-5:]})
except subprocess.TimeoutExpired as e:
 (out/'capture-timeout.log').write_bytes(e.stdout or b''); rec['checkpoint']='external timeout; no retry'
except BaseException as e:rec['checkpoint']=type(e).__name__+': '+str(e)
finally:
 rec['pins_after']={p:sha(p) for p in pins}; rec['pins_unchanged']=rec.get('pins_before')==rec['pins_after']; rec['active_s']=time.monotonic()-start; (out/'capture-receipt.json').write_text(json.dumps(rec,indent=2)); print(json.dumps(rec,indent=2))
