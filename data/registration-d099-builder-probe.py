import sys, os, json, time, pathlib, subprocess, threading, urllib.request, http.server, shutil, uuid
sys.path.insert(0, r'D:\KnowledgeBase\packages\meeting-bot\py')
import sb_join, seleniumbase, websocket, psutil
root=pathlib.Path(__file__).parent
profile=root/('profile-'+uuid.uuid4().hex); profile.mkdir(exist_ok=True)
extension=root/'extension'
shutil.copytree(r'D:\KnowledgeBase\packages\meeting-bot\py\tab-capture',extension,dirs_exist_ok=True)
manifest=json.loads((extension/'manifest.json').read_text())
assert {'contentSettings','declarativeNetRequest'} <= set(manifest['permissions'])
(extension/'manifest.json').write_text(json.dumps(manifest))
observed=[]; posts=[]; leaks=[]; redirected=[]; redirect_code=[None]; post_wait=threading.Event(); release=threading.Event()
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def respond(self,data,ctype='text/html',cookie=False):
  self.send_response(200); self.send_header('Content-Type',ctype)
  if cookie:self.send_header('Set-Cookie','auth=fixture; Path=/; SameSite=Lax')
  self.end_headers(); self.wfile.write(data.encode())
 def do_GET(self):
  if self.path.startswith('/leak'): leaks.append(self.path); self.respond('pixel'); return
  if self.path=='/sw.js':
   self.respond("self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method==='POST'&&new URL(e.request.url).pathname==='/submit'){e.respondWith((async()=>{const body=await e.request.clone().text();await fetch('/observed',{method:'POST',body});return fetch(e.request)})())}});",'application/javascript');return
  if self.path=='/install':
   self.respond('<script>navigator.serviceWorker.register("/sw.js")</script>',cookie=True);return
  self.respond('<form action="/submit" method="post"><input name="email" value="fixture@example.test"><input type="hidden" name="csrf" value="fixture-csrf"><button>submit</button></form>')
 def do_POST(self):
  body=self.rfile.read(int(self.headers.get('Content-Length',0))).decode()
  if self.path=='/observed': observed.append(body); self.respond('ok');return
  if self.path=='/redirected': redirected.append(body);self.respond('unexpected');return
  posts.append({'body':body,'cookie':self.headers.get('Cookie')})
  if len(posts)>1:post_wait.set();release.wait(12)
  if redirect_code[0]:
   self.send_response(redirect_code[0]);self.send_header('Location','http://localhost:%d/redirected'%self.server.server_port);self.end_headers();return
  self.respond('<img src="http://localhost:%d/leak?email=fixture%%40example.test">'%self.server.server_port)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start(); port=server.server_port
binary=pathlib.Path(seleniumbase.__file__).parent/'drivers'/'cft_drivers'/'chrome-win64'/'chrome.exe'
owned=sb_join.kill_orphans(str(profile),launch=True,expected_exe=str(binary))
proc=None; ws=None; seq=0; identities=[]; events=[]
def command(method,params=None,session=None):
 global seq
 seq+=1; ident=seq; data={'id':ident,'method':method,'params':params or {}}
 if session:data['sessionId']=session
 ws.send(json.dumps(data))
 while True:
  answer=json.loads(ws.recv())
  if answer.get('method'):events.append(answer)
  if answer.get('id')==ident:
   if 'error' in answer:raise RuntimeError(str(answer['error']))
   return answer.get('result',{})
def evaluate(expression,session):
 result=command('Runtime.evaluate',{'expression':expression,'awaitPromise':True,'returnByValue':True},session)
 if result.get('exceptionDetails'):raise RuntimeError(str(result['exceptionDetails']))
 return result.get('result',{}).get('value')
def attach_page():
 target=command('Target.createTarget',{'url':'about:blank'})['targetId']
 session=command('Target.attachToTarget',{'targetId':target,'flatten':True})['sessionId']
 command('Page.enable',session=session)
 return target,session
def navigate(session,path):
 command('Page.navigate',{'url':'http://127.0.0.1:%d%s'%(port,path)},session)
 time.sleep(.6)
try:
 proc=subprocess.Popen([str(binary),'--headless=new','--disable-background-networking','--disable-gpu','--no-first-run','--remote-debugging-port=0','--enable-unsafe-extension-debugging','--load-extension='+str(extension),'--user-data-dir='+str(profile),'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 owned['verify'](proc.pid)
 identities=[{'pid':proc.pid,'creationTime':psutil.Process(proc.pid).create_time()}]
 deadline=time.monotonic()+12
 while not (profile/'DevToolsActivePort').exists():
  if time.monotonic()>deadline:raise RuntimeError('debugger startup deadline')
  time.sleep(.1)
 debugger_port=(profile/'DevToolsActivePort').read_text().splitlines()[0]
 version=json.load(urllib.request.urlopen('http://127.0.0.1:'+debugger_port+'/json/version'))
 ws=websocket.create_connection(version['webSocketDebuggerUrl'],timeout=8,suppress_origin=True)
 target,session=attach_page();navigate(session,'/install')
 evaluate('navigator.serviceWorker.ready.then(()=>true)',session);navigate(session,'/form')
 baseline_controller=evaluate('!!navigator.serviceWorker.controller',session)
 evaluate('document.forms[0].submit();true',session);time.sleep(1)
 print(json.dumps({'phase':'baseline','browser':version['Browser'],'controller':baseline_controller,'observed':observed,'posts':posts,'leaks':leaks}),flush=True)
 if not baseline_controller or len(observed)!=1 or len(posts)!=1 or len(leaks)!=1:raise RuntimeError('positive control failed')
 extension_matches=[x for x in command('Extensions.getExtensions')['extensions'] if x.get('enabled') and x.get('path') and os.path.normcase(os.path.realpath(x['path']))==os.path.normcase(os.path.realpath(extension))]
 if len(extension_matches)!=1:raise RuntimeError('extension path ownership refused: '+str(extension_matches))
 extension_id=extension_matches[0]['id']
 workers=[x for x in command('Target.getTargets')['targetInfos'] if x['type']=='service_worker' and x['url']=='chrome-extension://'+extension_id+'/background.js']
 if len(workers)!=1:raise RuntimeError('extension worker ambiguous: '+str(workers))
 extension_session=command('Target.attachToTarget',{'targetId':workers[0]['targetId'],'flatten':True})['sessionId']
 resources=['main_frame','sub_frame','stylesheet','script','image','font','object','xmlhttprequest','ping','csp_report','media','websocket','webtransport','webbundle','other']
 rules=[{'id':910001,'priority':1,'action':{'type':'block'},'condition':{'urlFilter':'*','resourceTypes':resources}},{'id':910002,'priority':2,'action':{'type':'allow'},'condition':{'regexFilter':r'^http://127\.0\.0\.1(:[0-9]{1,5})?/','resourceTypes':resources}}]
 receipt={'nonce':str(uuid.uuid4()),'browserPid':proc.pid,'browserCreatedAt':identities[-1]['creationTime'],'profile':os.path.normcase(os.path.realpath(profile)),'extensionId':extension_id,'fingerprint':'fixture-canonical-rule-fingerprint'}
 policy_input={'receipt':receipt,'rules':rules,'primaryUrl':'http://127.0.0.1:%d/form'%port}
 readback=evaluate('installRegistrationPolicy('+json.dumps(policy_input)+')',extension_session)
 assert readback=={'receipt':receipt,'rules':rules,'javascript':{'setting':'block'}},readback
 policy=readback['javascript']
 print(json.dumps({'phase':'shipped_api_policy','receiptExact':True,'rulesExact':True,'javascript':policy}),flush=True)
 new_target,new_session=attach_page();navigate(new_session,'/form');command('Page.reload',{},new_session);time.sleep(.5)
 guarded_controller=evaluate('!!navigator.serviceWorker.controller',new_session)
 evaluate('document.forms[0].submit();true',new_session)
 if not post_wait.wait(3):raise RuntimeError('native guarded POST not reached')
 command('Target.detachFromTarget',{'sessionId':new_session});ws.close();ws=None
 release.set();time.sleep(2)
 print(json.dumps({'phase':'guarded_after_newtarget_reload_detach','controller':guarded_controller,'observed':observed,'posts':posts,'leaks':leaks,'browserAlive':proc.poll() is None,'owned':identities,'profile':str(profile)}),flush=True)
 passed=policy=={'setting':'block'} and len(observed)==1 and len(posts)==2 and len(leaks)==1 and posts[-1]['body']=='email=fixture%40example.test&csrf=fixture-csrf' and posts[-1]['cookie']=='auth=fixture' and proc.poll() is None
 # A paused approved native POST must resume safely when Fetch's transport detaches.
 ws=websocket.create_connection(version['webSocketDebuggerUrl'],timeout=8,suppress_origin=True)
 paused_target,paused_session=attach_page();navigate(paused_session,'/form')
 command('Fetch.enable',{'patterns':[{'urlPattern':'*/submit','requestStage':'Request'}]},paused_session)
 evaluate('document.forms[0].submit();true',paused_session)
 deadline=time.monotonic()+4
 while not any(x.get('method')=='Fetch.requestPaused' and x.get('sessionId')==paused_session for x in events):
  if time.monotonic()>deadline:raise RuntimeError('Fetch did not actually pause native POST')
  command('Target.getTargets');time.sleep(.05)
 command('Target.detachFromTarget',{'sessionId':paused_session});ws.close();ws=None;time.sleep(.7)
 assert len(posts)==3 and len(observed)==1 and len(leaks)==1
 print(json.dumps({'phase':'actual_paused_fetch_detach','nativePostResumed':True,'additionalWorkerObservations':0,'additionalLeaks':0}),flush=True)
 # Browser/profile relaunch must retain restrictions without conferring new receipt readiness.
 ws=websocket.create_connection(version['webSocketDebuggerUrl'],timeout=8,suppress_origin=True)
 command('Browser.close');ws.close();ws=None;proc.wait(timeout=8)
 active_port=profile/'DevToolsActivePort'
 if active_port.exists():active_port.unlink()
 proc=subprocess.Popen([str(binary),'--headless=new','--disable-background-networking','--disable-gpu','--no-first-run','--remote-debugging-port=0','--enable-unsafe-extension-debugging','--load-extension='+str(extension),'--user-data-dir='+str(profile),'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 owned['verify'](proc.pid);identities.append({'pid':proc.pid,'creationTime':psutil.Process(proc.pid).create_time()})
 deadline=time.monotonic()+12
 while not active_port.exists():
  if time.monotonic()>deadline:raise RuntimeError('relaunch startup deadline')
  time.sleep(.1)
 debugger_port=active_port.read_text().splitlines()[0];version=json.load(urllib.request.urlopen('http://127.0.0.1:'+debugger_port+'/json/version'));ws=websocket.create_connection(version['webSocketDebuggerUrl'],timeout=8,suppress_origin=True)
 deadline=time.monotonic()+8
 while True:
  workers=[x for x in command('Target.getTargets')['targetInfos'] if x['type']=='service_worker' and x['url']=='chrome-extension://'+extension_id+'/background.js']
  if len(workers)==1:break
  if time.monotonic()>deadline:raise RuntimeError('relaunch worker deadline')
  time.sleep(.1)
 extension_session=command('Target.attachToTarget',{'targetId':workers[0]['targetId'],'flatten':True})['sessionId']
 residue=evaluate('readRegistrationPolicy('+json.dumps(policy_input['primaryUrl'])+')',extension_session)
 assert residue=={'receipt':None,'rules':rules,'javascript':{'setting':'block'}},residue
 target,session=attach_page();navigate(session,'/form');evaluate('document.forms[0].submit();true',session);time.sleep(.7)
 assert len(observed)==1 and len(posts)==4 and len(leaks)==1
 print(json.dumps({'phase':'profile_relaunch_worker_restart','persistedRules':True,'persistedJSblock':True,'receiptNotReadiness':True,'newWorkerObserved':0,'newLeaks':0}),flush=True)
 # Delay native 307/308 headers until control has closed, then release while Chrome lives.
 for code in [307,308]:
  redirect_code[0]=code;post_wait.clear();release.clear();before=len(posts)
  redirect_target,redirect_session=attach_page();navigate(redirect_session,'/form');evaluate('document.forms[0].submit();true',redirect_session)
  assert post_wait.wait(3),'delayed redirect POST not reached'
  command('Target.detachFromTarget',{'sessionId':redirect_session});ws.close();ws=None;release.set();time.sleep(.7)
  assert len(posts)==before+1 and not redirected and len(observed)==1 and len(leaks)==1 and proc.poll() is None
  print(json.dumps({'phase':'delayed_redirect_control_close','code':code,'approvedPosts':1,'unapprovedPosts':0,'browserAlive':True}),flush=True)
  ws=websocket.create_connection(version['webSocketDebuggerUrl'],timeout=8,suppress_origin=True)
 redirect_code[0]=None
 workers=[x for x in command('Target.getTargets')['targetInfos'] if x['type']=='service_worker' and x['url']=='chrome-extension://'+extension_id+'/background.js']
 assert len(workers)==1
 extension_session=command('Target.attachToTarget',{'targetId':workers[0]['targetId'],'flatten':True})['sessionId']
 session=command('Target.attachToTarget',{'targetId':redirect_target,'flatten':True})['sessionId']
 # Actual worker-only stop/start, independently identified by its script and target.
 command('ServiceWorker.enable',{},session)
 versions=[v for event in events if event.get('method')=='ServiceWorker.workerVersionUpdated' for v in event['params'].get('versions',[]) if v.get('scriptURL')=='chrome-extension://'+extension_id+'/background.js']
 if not versions:raise RuntimeError('extension worker version discovery unavailable')
 worker_version=versions[-1]['versionId'];old_worker=workers[0]['targetId']
 command('Target.detachFromTarget',{'sessionId':extension_session});command('ServiceWorker.stopWorker',{'versionId':worker_version},session)
 deadline=time.monotonic()+5
 while any(x['targetId']==old_worker for x in command('Target.getTargets')['targetInfos']):
  if time.monotonic()>deadline:raise RuntimeError('actual worker stop not observed')
  time.sleep(.1)
 command('ServiceWorker.startWorker',{'scopeURL':'chrome-extension://'+extension_id+'/'},session)
 deadline=time.monotonic()+5
 while True:
  restarted=[x for x in command('Target.getTargets')['targetInfos'] if x['type']=='service_worker' and x['url']=='chrome-extension://'+extension_id+'/background.js']
  if len(restarted)==1 and restarted[0]['targetId']!=old_worker:break
  if time.monotonic()>deadline:raise RuntimeError('distinct worker restart not observed')
  time.sleep(.1)
 extension_session=command('Target.attachToTarget',{'targetId':restarted[0]['targetId'],'flatten':True})['sessionId']
 restarted_readback=evaluate('readRegistrationPolicy('+json.dumps(policy_input['primaryUrl'])+')',extension_session)
 assert restarted_readback=={'receipt':None,'rules':rules,'javascript':{'setting':'block'}},restarted_readback
 print(json.dumps({'phase':'worker_only_stop_restart','oldTargetGone':True,'distinctNewTarget':True,'rulesJSRetained':True,'receiptNullRefusesReadiness':True}),flush=True)
 # Clear only after all registration pages are gone; then recording JavaScript runs again.
 blank,blank_session=attach_page()
 for item in command('Target.getTargets')['targetInfos']:
  if item['type']=='page' and item['targetId']!=blank:command('Target.closeTarget',{'targetId':item['targetId']})
 deadline=time.monotonic()+5
 while True:
  pages=[x for x in command('Target.getTargets')['targetInfos'] if x['type']=='page']
  if len(pages)==1 and pages[0]['targetId']==blank:break
  if time.monotonic()>deadline:raise RuntimeError('clear prior target deadline')
  time.sleep(.1)
 cleared=evaluate('clearRegistrationPolicy('+json.dumps({'extensionId':extension_id,'priorTargetsGone':True,'primaryUrl':policy_input['primaryUrl']})+')',extension_session)
 assert cleared=={'receipt':None,'rules':[],'javascript':{'setting':'allow'}},cleared
 command('Page.navigate',{'url':'data:text/html,<script>window.recordingRestored=42</script>'},blank_session);time.sleep(.3);assert evaluate('window.recordingRestored',blank_session)==42
 print(json.dumps({'phase':'recording_restore','ownRulesCleared':True,'javascriptRuns':True}),flush=True)
 print(json.dumps({'capabilityPASS':passed}),flush=True)
 if not passed:sys.exit(2)
finally:
 release.set()
 if ws:
  try:command('Browser.close')
  except Exception:pass
  ws.close()
 if proc and proc.poll() is None:
  proc.terminate()
  try:proc.wait(timeout=5)
  except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=3)
 server.shutdown();server.server_close()
 print(json.dumps({'phase':'finally','owned':identities,'browserExit':proc.poll() if proc else None,'profile':str(profile)}),flush=True)
