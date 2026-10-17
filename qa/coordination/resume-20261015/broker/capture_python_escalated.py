import pathlib,json,os,sys,hashlib,subprocess,time
out=pathlib.Path(__file__).parent;root=out.parents[3];r=json.loads((root/'qa/coordination/resume-20261015/capture/broker-request.json').read_text());packet=json.loads(pathlib.Path(r['packet']).read_text());pins={j['path']:j['sha256'].lower() for j in packet['unit']['files']}
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
rec={'authority':'root authorizes original Python12 outside sandbox after owned-process reconciliation','actual_total_tokens':None};start=time.monotonic()
try:
 rec['pins_before']={p:sha(p) for p in pins};assert rec['pins_before']==pins
 temp=out/'capture-escalated-python-temp';temp.mkdir(exist_ok=True);probe=temp/'probe';probe.mkdir();(probe/'bytes').write_bytes(b'x');assert (probe/'bytes').read_bytes()==b'x';(probe/'bytes').unlink();probe.rmdir()
 env=os.environ.copy();env.update(r['environment']);env.update(TMP=str(temp),TEMP=str(temp),KB_U24_PRIVATE_TOC_TESTS='0',T054_AUTHENTIC_INPUT_OPT_IN='0',LKB_WHATSAPP_CONSENT_MONGO_RUN='0');py=r['commands'][0]['executable'];rec['python_sha256']=sha(py);rec['environment']=r['environment'];rec['temp_parent']=str(temp)
 pre=r['preflight'][1];p=subprocess.run([pre['executable'],*pre['args']],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=15);(out/'capture-python-escalated-preflight.log').write_bytes(p.stdout);rec['preflight_exit']=p.returncode;assert p.returncode==0
 basetemp=out/'capture-escalated-pytest-fresh';assert not basetemp.exists();args=list(r['commands'][0]['args']);args[-1]=str(basetemp);rec['command']=[py,*args];rec['cwd']=str(root);rec['change']='only fresh basetemp location and sandbox execution context; original pytest/plugins/selection retained'
 s=time.monotonic();p=subprocess.run([py,*args],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=45);(out/'capture-python-escalated.log').write_bytes(p.stdout);rec.update(exit=p.returncode,command_s=time.monotonic()-s,output_tail=p.stdout.decode(errors='replace').splitlines()[-20:])
except subprocess.TimeoutExpired as e:(out/'capture-python-escalated.log').write_bytes(e.stdout or b'');rec['checkpoint']='external45s timeout; no retry'
except BaseException as e:rec['checkpoint']=type(e).__name__+': '+str(e)
finally:
 rec['pins_after']={p:sha(p) for p in pins};rec['pins_unchanged']=rec.get('pins_before')==rec['pins_after'];rec['active_s']=time.monotonic()-start;(out/'capture-python-escalated-receipt.json').write_text(json.dumps(rec,indent=2));print(json.dumps(rec,indent=2))
