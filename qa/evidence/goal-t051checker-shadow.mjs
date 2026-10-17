import assert from 'node:assert/strict';
import {constants, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {installUbuntuSupervisor, UNIT_NAME} from '../../scripts/webinar/supervisor/install-ubuntu-supervisor.mjs';

const source = readFileSync(new URL('../../scripts/webinar/supervisor/install-ubuntu-supervisor.test.mjs', import.meta.url), 'utf8');
const definition = source.slice(source.indexOf('function fixture()'), source.indexOf('\ntest('));
const f = runInNewContext(definition + '\nfixture()', {assert, constants, dirname, join, resolve, Buffer, UNIT_NAME});
installUbuntuSupervisor({root:f.root, display:':0', install:true}, f.d);
f.calls.length = 0;
const originalSpawn = f.d.spawn;
const shadowed = '/run/user/1000/systemd/transient/lkb-webinar-portable-supervisor.service';
let launched = null;
f.d.spawn = (command, args, options) => {
  if (command === f.node) return originalSpawn(command, args, options);
  f.calls.push([command, args, options]);
  if (args.includes('show')) return {status:0, stdout:`LoadState=loaded\nFragmentPath=${shadowed}\nDropInPaths=/run/user/1000/systemd/user/lkb-webinar-portable-supervisor.service.d/override.conf\nExecStart=/usr/bin/false\n`};
  if (args.includes('enable') && args.includes('--now')) launched = shadowed;
  return {status:0, stdout:''};
};
let refused = false, result;
try { result = installUbuntuSupervisor({root:f.root, display:':0', activate:true}, f.d); }
catch { refused = true; }
console.log(JSON.stringify({expectedUnit:f.target, effectiveUnit:shadowed, launched, refused, result, managerQueries:f.calls.map(row=>row[1])}));
assert.equal(launched, null, 'Activation must refuse a manager effective unit differing from the independently verified physical unit before launching it');
assert.equal(refused, true, 'A shadowed effective unit must be refused');
