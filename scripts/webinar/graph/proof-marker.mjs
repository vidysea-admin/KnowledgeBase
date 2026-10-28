/** Owned artifact directories and atomic completion marker; no checkpoint or retry policy here. */
import {closeSync,fsyncSync,lstatSync,mkdirSync,openSync,realpathSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {isAbsolute,join,relative,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const escaping = rel => rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel);

export function ownedDirectory(root, directory) {
  const rel=relative(resolve(root),resolve(directory));
  if(escaping(rel))throw new Error('Graph directory outside configured root');
  let current=realpathSync(root);
  for(const segment of rel.split(/[\\/]/).filter(Boolean)) {
    current=join(current,segment);
    let stat;
    try {stat=lstatSync(current);} catch(error) {if(error.code!=='ENOENT')throw error;}
    if(stat && (stat.isSymbolicLink()||!stat.isDirectory()))throw new Error('Graph directory is redirected or invalid');
    if(!stat)mkdirSync(current);
  }
  return current;
}

export function writeProofMarker(root, directory, id, proof, context) {
  if(!context||context.runKey!==id||!context.tenantId)throw new Error('Graph proof identity missing');
  if((proof.sessionId&&proof.sessionId!==id)||(proof.tenantId&&proof.tenantId!==context.tenantId))
    throw new Error('Graph proof identity mismatch');
  const dir=ownedDirectory(root,directory), target=join(dir,'pipeline-state.json');
  let existing;
  try {existing=lstatSync(target);} catch(error) {if(error.code!=='ENOENT')throw error;}
  if(existing&&(existing.isSymbolicLink()||!existing.isFile()))throw new Error('Graph marker is redirected or invalid');
  const temp=join(dir,`.pipeline-state-${randomUUID()}.tmp`);
  let fd;
  try {
    fd=openSync(temp,'wx',0o600);
    writeFileSync(fd,JSON.stringify({...proof,sessionId:id,tenantId:context.tenantId,pipelineGeneration:context.generation??0,
      stage:'index',status:'done',updatedAt:new Date().toISOString()})+'\n');
    fsyncSync(fd);closeSync(fd);fd=undefined;
    context.signal?.throwIfAborted();
    renameSync(temp,target);
  }finally{
    if(fd!==undefined)closeSync(fd);
    try{unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
}
