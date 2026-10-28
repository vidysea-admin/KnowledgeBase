import test from 'node:test';
import assert from 'node:assert/strict';
import { constants, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { installUbuntuSupervisor, UNIT_NAME, verifyUbuntuUnit } from './install-ubuntu-supervisor.mjs';
import { runInNewContext } from 'node:vm';
const {dirname, join, resolve} = posix;

function fixture() {
  // Keep this fake filesystem POSIX even when independently extracted into a Windows VM.
  const dirname = path => path.slice(0, path.lastIndexOf('/')) || '/';
  const join = (...parts) => parts.join('/').replace(/\/+/g, '/');
  const resolve = path => path;
  const root = '/home/operator/KnowledgeBase', home = '/home/operator', node = '/usr/bin/node';
  const files = new Map(), handles = new Map(), calls = [], mutations = [];
  const stat = (directory, uid = 1000, mode = 0o700, text = '', linked = false) => ({uid, mode, text,
    size: Buffer.byteLength(text), isDirectory: () => directory, isFile: () => !directory,
    isSymbolicLink: () => linked});
  const add = (path, directory, uid = 1000, mode = 0o700, text = '') => {
    let cursor = dirname(path);
    while (!files.has(cursor)) {
      files.set(cursor, stat(true)); const next = dirname(cursor); if (next === cursor) break; cursor = next;
    }
    files.set(path, stat(directory, uid, mode, text));
  };
  add(root, true); add(home, true); add(node, false);
  add(join(root, 'scripts/webinar/setup.mjs'), false); add(join(root, 'scripts/webinar/run-pipeline.mjs'), false);
  add(resolve('/usr/bin/systemctl'), false, 0, 0o755);
  const quote = text => '"' + text.replace(/\\/g, '\\\\').replace(/%/g, '%%').replace(/\$/g, '$$$$') + '"';
  const text = `[Unit]
Description=Vidysea webinar pipeline (manual live proof required)
After=graphical-session.target
PartOf=graphical-session.target
[Service]
Type=exec
WorkingDirectory=${quote(root)}
Environment=DISPLAY=:0
ExecStart=${quote(node)} ${quote(`${root}/scripts/webinar/run-pipeline.mjs`)} --run --watch
Restart=on-failure
RestartSec=60
[Install]
WantedBy=graphical-session.target\n`;
  const target = join(home, '.config/systemd/user', UNIT_NAME);
  const d = {
    platform: 'linux', uid: 1000, home, node,
    lstat: path => { if (!files.has(path)) throw new Error('ENOENT'); return files.get(path); },
    exists: path => files.has(path),
    mkdir: (path, options) => { mutations.push(['mkdir', path]); add(path, true, 1000, options.mode); },
    open: (path, flags, mode) => {
      if (flags & constants.O_CREAT) {
        assert.ok(flags & constants.O_EXCL);
        if (files.has(path)) throw new Error('EEXIST');
        mutations.push(['open', path]); add(path, false, 1000, mode);
      }
      if (!files.has(path)) throw new Error('ENOENT');
      const fd = handles.size + 10; handles.set(fd, path); return fd;
    },
    fstat: fd => files.get(handles.get(fd)),
    read: fd => files.get(handles.get(fd)).text,
    write: (fd, content) => { mutations.push(['write', handles.get(fd)]); const before=files.get(handles.get(fd));
      files.set(handles.get(fd), stat(false, before.uid, before.mode, content)); },
    close: fd => handles.delete(fd),
    spawn: (command, args, options) => {
      calls.push([command, args, options]);
      if (command === node) return {status: 0, stdout: text};
      if (args[1] === 'is-enabled') return files.has(target) ? {status: 1, stdout: 'disabled\n'} : {status: 4, stdout: 'not-found\n'};
      if (args[1] === 'show') return {status:0, stdout:[`FragmentPath=${target}`,'DropInPaths=','LoadState=loaded','Transient=no',
        'NeedDaemonReload=no',`WorkingDirectory=${root}`,'Environment=DISPLAY=:0',
        `ExecStart={ path=${node} ; argv[]=${node} ${root}/scripts/webinar/run-pipeline.mjs --run --watch ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }`].join('\n')};
      return {status: 0, stdout: ''};
    },
  };
  return {root, home, node, text, target, d, calls, mutations, files, handles, add};
}

test('preview executes the real setup interface but creates no directories/unit or systemctl call', () => {
  const f=fixture(), result=installUbuntuSupervisor({root:f.root, display:':0'}, f.d);
  assert.equal(result.status, 'preview'); assert.equal(result.unit, f.target);
  assert.deepEqual(f.mutations, []); assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0][1], [join(f.root,'scripts/webinar/setup.mjs'),'--service-preview','--display=:0']);
  assert.equal(f.calls[0][2].timeout,15000); assert.equal(f.calls[0][2].maxBuffer,65536); assert.equal(f.calls[0][2].shell,false);
});

test('installation exclusively creates a private unit, reads it back and checks disabled state without activation', () => {
  const f=fixture(), result=installUbuntuSupervisor({root:f.root, display:':0', install:true}, f.d);
  assert.equal(result.status,'installed-disabled'); assert.equal(result.liveRecoveryVerified,false);
  assert.equal(f.files.get(f.target).mode,0o600); assert.equal(f.files.get(f.target).text,f.text);
  assert.equal(f.handles.size,0);
  assert.deepEqual(f.calls.slice(1).map(row=>row[1]), [['--user','is-enabled',UNIT_NAME],['--user','is-enabled',UNIT_NAME]]);
  assert.throws(()=>installUbuntuSupervisor({root:f.root,display:':0',install:true},f.d),/EEXIST/);
  assert.equal(f.files.get(f.target).text,f.text);
});

test('explicit activation validates an existing bound unit and calls user systemctl then checks active', () => {
  const f=fixture(); installUbuntuSupervisor({root:f.root,display:':0',install:true},f.d); f.calls.length=0;
  const result=installUbuntuSupervisor({root:f.root,display:':0',activate:true},f.d);
  assert.equal(result.status,'activated'); assert.equal(result.liveRecoveryVerified,false);
  assert.deepEqual(f.calls.slice(1).map(row=>row[1][1]), ['daemon-reload','show','enable','is-active']);
  assert.deepEqual(f.calls[3][1],['--user','enable','--now',UNIT_NAME]);
});

test('missing or foreign installed unit refuses activation before systemctl', () => {
  const missing=fixture(); assert.throws(()=>installUbuntuSupervisor({root:missing.root,display:':0',activate:true},missing.d),/Install.*first/);
  const f=fixture(); installUbuntuSupervisor({root:f.root,display:':0',install:true},f.d); f.calls.length=0;
  f.add(f.target,false,1000,0o600,f.text.replace('--run --watch','--run --watch --unsafe'));
  assert.throws(()=>installUbuntuSupervisor({root:f.root,display:':0',activate:true},f.d),/binding/);
  assert.equal(f.calls.length,1);
});

test('root, other OS, remote display and combined mutation modes are refused', () => {
  for(const [overrides,options] of [[{uid:0},{}],[{platform:'win32'},{}],[{},{display:'host:0'}],[{},{install:true,activate:true}]]) {
    const f=fixture(); assert.throws(()=>installUbuntuSupervisor({root:f.root,display:':0',...options},{...f.d,...overrides}));
    assert.equal(f.calls.length,0); assert.deepEqual(f.mutations,[]);
  }
});

test('malformed/oversized preview and subprocess deadline/failure never write a unit', () => {
  for(const result of [{status:0,stdout:'bad'},{status:0,stdout:'x'.repeat(65537)},{status:null,error:{code:'ETIMEDOUT'}},{status:1,stdout:''}]) {
    const f=fixture(); f.d.spawn=()=>result;
    assert.throws(()=>installUbuntuSupervisor({root:f.root,display:':0',install:true},f.d)); assert.deepEqual(f.mutations,[]);
  }
});

test('linked or group-writable configuration and foreign unit owner are refused', () => {
  for(const mode of ['linked','writable','foreign-unit']) {
    const f=fixture(); installUbuntuSupervisor({root:f.root,display:':0',install:true},f.d); f.calls.length=0;
    if(mode==='linked') f.files.get(join(f.home,'.config')).isSymbolicLink=()=>true;
    if(mode==='writable') f.files.get(join(f.home,'.config')).mode=0o777;
    if(mode==='foreign-unit') f.files.get(f.target).uid=2000;
    assert.throws(()=>installUbuntuSupervisor({root:f.root,display:':0',activate:true},f.d));
    assert.equal(f.calls.length,1);
  }
});

test('pre-existing enablement and unknown disabled-state checks refuse installation', () => {
  for(const state of ['enabled','enabled-runtime','masked','unknown']) {
    const f=fixture(), preview=f.d.spawn;
    f.d.spawn=(command,args,options)=>command===f.node?preview(command,args,options):{status:0,stdout:state};
    assert.throws(()=>installUbuntuSupervisor({root:f.root,display:':0',install:true},f.d),/enablement|unknown/);
    assert.equal(f.files.has(f.target),false);
  }
});

test('extra service directives and duplicate/rebound executable are rejected by exact binding', () => {
  const f=fixture();
  for(const text of [f.text+'ExecStart=/bin/sh\n',f.text.replace('RestartSec=60','RestartSec=1'),f.text.replace('DISPLAY=:0','DISPLAY=:1')]) {
    assert.throws(()=>verifyUbuntuUnit(text,{root:f.root,node:f.node,display:':0'}),/binding/);
  }
  assert.equal(verifyUbuntuUnit(f.text,{root:f.root,node:f.node,display:':0'}),f.text);
});

test('actual common setup renderer output is consumed with Linux paths and systemd metacharacter escaping', () => {
  // Evaluate only the production renderer definition: importing setup would run its doctor.
  const source = readFileSync(new URL('../setup.mjs', import.meta.url), 'utf8');
  const definition = source.slice(source.indexOf('export function renderServicePreview'), source.indexOf("if (process.argv.includes('--service-preview'))"));
  const render = runInNewContext(definition.replace('export function', 'function') + '\nrenderServicePreview');
  for (const root of ['/home/operator/KnowledgeBase','/home/operator/Knowledge Base%$']) {
    const options={platform:'linux',projectRoot:root,node:'/usr/bin/node',display:':0'};
    assert.equal(verifyUbuntuUnit(render(options),{root,node:options.node,display:options.display}),render(options)+'\n');
  }
});

test('shadowed manager fragment, drop-ins, reload state and foreign executable refuse before enable/start', () => {
  for (const replace of [output=>output.replace(/FragmentPath=[^\n]+/,'FragmentPath=/run/user/1000/systemd/transient/evil.service'),
    output=>output.replace('DropInPaths=','DropInPaths=/home/operator/override.conf'),
    output=>output.replace('NeedDaemonReload=no','NeedDaemonReload=yes'),
    output=>output.replace('path=/usr/bin/node','path=/bin/sh'),
    output=>output.replace('--run --watch','--run --watch --evil'),
    output=>output+'\nExecStart=duplicate']) {
    const f=fixture(); installUbuntuSupervisor({root:f.root,display:':0',install:true},f.d); f.calls.length=0;
    const run=f.d.spawn;
    f.d.spawn=(command,args,options)=>{const result=run(command,args,options);return args[1]==='show'?{...result,stdout:replace(result.stdout)}:result;};
    assert.throws(()=>installUbuntuSupervisor({root:f.root,display:':0',activate:true},f.d),/manager|effective|Effective|binding/);
    assert.ok(!f.calls.some(row=>row[1][1]==='enable'));
  }
});
