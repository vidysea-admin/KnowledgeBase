import sys, os, json, hashlib, subprocess, time, pathlib, platform
root=pathlib.Path(__file__).resolve().parents[4]
out=pathlib.Path(__file__).parent
request=root/'qa/coordination/resume-20261015/deadline-maker/broker-request.json'
r=json.loads(request.read_text())
start=time.monotonic()
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(name,obj): (out/name).write_text(json.dumps(obj,indent=2),encoding='utf-8')
receipt={'request_sha256':sha(request),'started_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'commands':[],'actual_total_tokens':None,'authority':'broker evidence only; no checker verdict'}
rows=root/'qa/evidence/goal-t059-maker/rows.json'
backup=None
had_rows=rows.exists()
try:
 before={p:sha(root/p) for p in r['hashes']}
 receipt['pins_before']=before
 if before!=r['hashes']: raise RuntimeError('request pins mismatch')
 temp=pathlib.Path(r['temp_parent']); temp.mkdir(parents=True,exist_ok=True)
 probe=temp/'broker-owned-probe'; probe.mkdir(exist_ok=False)
 try:
  (probe/'bytes').write_bytes(b'probe'); assert (probe/'bytes').read_bytes()==b'probe'
 finally:
  (probe/'bytes').unlink(missing_ok=True); probe.rmdir()
 env=os.environ.copy(); env.update(r['broker_safe_env']); env['TMP']=str(temp); env['TEMP']=str(temp)
 node=r['requests'][0]['program']
 pre=subprocess.run([node,'--input-type=module','-e',"console.log(JSON.stringify({executable:process.execPath,version:process.version,tsx:import.meta.resolve('tsx')}))"],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=10)
 (out/'deadline-preflight.log').write_bytes(pre.stdout)
 receipt['preflight']={'exit':pre.returncode,'node_sha256':sha(pathlib.Path(node)),'python':sys.executable,'python_version':platform.python_version(),'python_sha256':sha(pathlib.Path(sys.executable)),'cwd':str(root),'temp_parent':str(temp),'safe_env':r['broker_safe_env']}
 if pre.returncode: raise RuntimeError('Node import preflight failed')
 info=json.loads(pre.stdout.decode().strip()); assert info['tsx'].startswith((root/'node_modules').as_uri())
 if had_rows:
  backup=rows.read_bytes(); (out/'deadline-historical-rows.backup').write_bytes(backup)
 receipt['rows_before']={'existed':had_rows,'sha256':sha(rows) if had_rows else None}
 for job in r['requests']:
  t=time.monotonic(); item={'label':job['label'],'program':job['program'],'args':job['args'],'cwd':job['cwd']}
  try:
   run=subprocess.run([job['program'],*job['args']],cwd=job['cwd'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=job['outerTimeoutMs']/1000)
   data=run.stdout; item['exit']=run.returncode
  except subprocess.TimeoutExpired as e:
   data=e.stdout or b''; item['exit']=None; item['timeout']=True
  item['duration_s']=time.monotonic()-t
  log=out/('deadline-'+job['label']+'.log'); log.write_bytes(data); item['output_path']=str(log)
  import re
  txt=data.decode(errors='replace'); item['counts']={k:int(v) for k,v in re.findall(r'# (tests|pass|fail|cancelled|skipped|todo) (\d+)',txt)}
  receipt['commands'].append(item)
  save('deadline-receipt.json',receipt)
except BaseException as e:
 receipt['checkpoint']=type(e).__name__+': '+str(e)
finally:
 if backup is not None: rows.write_bytes(backup)
 elif not had_rows and rows.exists(): rows.unlink()
 receipt['rows_restored']=rows.exists()==had_rows and (not had_rows or rows.read_bytes()==backup)
 receipt['pins_after']={p:sha(root/p) for p in r['hashes'] if (root/p).exists()}
 receipt['pins_unchanged']=receipt.get('pins_before')==receipt['pins_after']
 receipt['active_s']=time.monotonic()-start
 save('deadline-receipt.json',receipt)
 print(json.dumps(receipt,indent=2))
