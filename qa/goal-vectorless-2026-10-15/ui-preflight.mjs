import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),req=createRequire(resolve(root,'package.json'));
const modules={};
for(const name of ['vitest','vite','jsdom','react','@testing-library/react']) {
  const entry=req.resolve(name),meta=req.resolve(name+'/package.json');
  modules[name]={entry,version:JSON.parse(readFileSync(meta,'utf8')).version};
  if(name!=='vitest') await import(pathToFileURL(entry).href);
}
const parent=tmpdir(),folder=mkdtempSync(join(parent,'kb-ui-preflight-'));
try {const file=join(folder,'probe');writeFileSync(file,'bounded-ui-probe');if(readFileSync(file,'utf8')!=='bounded-ui-probe')throw Error('temp mismatch');unlinkSync(file);} finally {rmdirSync(folder);}
console.log(JSON.stringify({status:'PREFLIGHT_OK',node:process.version,executable:process.execPath,importRoot:root,modules,tempParent:parent,tempWritable:true,network:false,browser:false}));
