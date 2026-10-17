import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';
const base='qa/evidence/goal-t051checker-broker-',hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),ready=[],skipped=[];
for(const [name,file] of [
 ['t007-reviewer-snapshot-exact-floor','qa/evidence/goal-t007/reviewer-independent-snapshot-cycle2-spec.json'],
 ['t044-private-independent13','qa/evidence/t044-trusted-private-windows/checker-current38.spec.json'],
 ['t028-t060-mounted-independent4','qa/evidence/goal-t028-t060-mounted-checker-spec.json']]){
 const s=JSON.parse(readFileSync(file,'utf8'));s.pins[file]=hash(file);s.output=base+name;
 const drift=Object.entries(s.pins).filter(([p,h])=>!existsSync(p)||hash(p)!==h.toLowerCase());
 if(drift.length){skipped.push({name,drift});continue;}
 writeFileSync(s.output+'-spec.json',JSON.stringify(s,null,2)+'\n');ready.push(name);
}
writeFileSync(base+'batch-fast13.json',JSON.stringify({ready,skipped},null,2)+'\n');console.log(JSON.stringify({ready,skipped}));
