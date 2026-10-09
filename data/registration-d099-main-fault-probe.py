import sys,pathlib,tempfile,threading,http.server,subprocess,json,shutil,time
posts=[];leaks=[]
class H(http.server.BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  if self.path.startswith('/leak'):leaks.append(self.path)
  self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Set-Cookie','auth=fixture; Path=/');self.end_headers();self.wfile.write(b'<form id="registration" action="/submit" method="post"><input id="first" name="first"><input id="last" name="last"><input id="email" name="email"><input type="hidden" name="csrf" value="token"><button type="submit">Register</button></form>')
 def do_POST(self):
  posts.append({'body':self.rfile.read(int(self.headers['Content-Length'])).decode(),'cookie':self.headers.get('Cookie')});self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(('<img src="http://localhost:%d/leak?email=fixture">'%self.server.server_port).encode())
s=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=s.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{s.server_address[1]}'
i={'url':base+'/register','allowedHosts':['127.0.0.1'],'localFixture':True,'operator':{'firstName':'Fixture','lastName':'Operator','email':'fixture@example.test'},'form':{'mode':'native-html','formSelector':'#registration','submitSelector':'button[type=submit]','fields':{'firstName':'#first','lastName':'#last','email':'#email'}}}
try:
 for fault in ['missing-permission','missing-api','wrong-readback','positive']:
  root=pathlib.Path(tempfile.mkdtemp(prefix='d099-main-',dir='data')).resolve();profile=str(root/'profile');stop=str(root/'stop');main=root/'sb_join.py';shutil.copy2('packages/meeting-bot/py/sb_join.py',main);extension=root/'tab-capture';shutil.copytree('packages/meeting-bot/py/tab-capture',extension)
  if fault=='missing-permission':
   m=json.loads((extension/'manifest.json').read_text());m['permissions'].remove('declarativeNetRequest');(extension/'manifest.json').write_text(json.dumps(m))
  if fault=='missing-api':
   with (extension/'background.js').open('a') as f:f.write('\ndelete globalThis.installRegistrationPolicy;\n')
  if fault=='wrong-readback':
   with (extension/'background.js').open('a') as f:f.write('\nconst actualRead=globalThis.readRegistrationPolicy;globalThis.readRegistrationPolicy=async(url)=>{const r=await actualRead(url);if(r.receipt)r.receipt.nonce="wrong";return r};\n')
  posts.clear();leaks.clear()
  try:
   cmd=[sys.executable,str(main),'about:blank','--profile',profile,'--title','Fixture','--stop-file',stop,'--browser-executable','cft','--registration-stdin'];r=subprocess.run(cmd,input=json.dumps(i),text=True,capture_output=True,timeout=55);time.sleep(.2)
   if fault=='positive':
    assert r.returncode==0 and len(posts)==1 and not leaks,(r.stdout,r.stderr,posts,leaks)
    assert posts[0]=={'body':'first=Fixture&last=Operator&email=fixture%40example.test&csrf=token','cookie':'auth=fixture'},posts
   else:assert r.returncode!=0 and not posts and not leaks,(fault,r.stdout,r.stderr,posts,leaks)
   print(json.dumps({'fault':fault,'exit':r.returncode,'nativePosts':len(posts),'unapprovedResources':len(leaks)}),flush=True)
  finally:
   c=subprocess.run([sys.executable,str(main),'about:blank','--profile',profile,'--title','Fixture','--stop-file',stop,'--cleanup-only'],text=True,capture_output=True,timeout=25);assert c.returncode==0,(fault,c.stdout,c.stderr);print('exact-profile-cleanup',fault,c.returncode,flush=True)
finally:s.shutdown();s.server_close()
