/** Approved private local trainer orchestration. No model downloads, uploads or provider adapters. */
import { spawn } from 'node:child_process';
import { realpathSync, mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join, isAbsolute, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { validateTrainingExport, newTrainingDestination, trainingOutputOutsideCorpus } from './export.mjs';
import { trainingApproval } from './validate.mjs';
import { trainingHash } from './plan.mjs';
import { trainingArguments, readTrainingJson, TRAINING_ROOT } from './prepare.mjs';
import { assertPrivateTrainingPath } from './private-path.mjs';
import { hashTrainingFile } from './file-hash.mjs';
const requireValue=(condition,message)=>{if(!condition)throw new Error(message);};
export function validateLocalTrainingRecipe(recipe) {
  requireValue(recipe?.format === 'private-training-recipe-v1' && recipe.privacy === 'local-only' &&
    recipe.taskFormat === 'grounded-claim-v1','private supported recipe required');
  requireValue(typeof recipe.baseModel === 'string' && recipe.baseModel.trim() && /^[a-f0-9]{64}$/.test(recipe.baseModelSha256) &&
    typeof recipe.license === 'string' && recipe.license.trim() && typeof recipe.trainerVersion === 'string' && recipe.trainerVersion.trim(), 'versioned model/license/trainer identity required');
  assertPrivateTrainingPath(recipe.baseModelPath); assertPrivateTrainingPath(recipe.executable);
  for(const artifact of recipe.artifacts ?? []) assertPrivateTrainingPath(artifact?.path);
  requireValue(isAbsolute(recipe.baseModelPath) && existsSync(recipe.baseModelPath) && realpathSync(recipe.baseModelPath) === recipe.baseModelPath &&
    statSync(recipe.baseModelPath).isFile() && hashTrainingFile(recipe.baseModelPath) === recipe.baseModelSha256, 'exact local base-model file required');
  requireValue(isAbsolute(recipe.executable) && existsSync(recipe.executable) && realpathSync(recipe.executable) === recipe.executable &&
    /^[a-f0-9]{64}$/.test(recipe.executableSha256) && hashTrainingFile(recipe.executable) === recipe.executableSha256, 'exact local trainer executable required');
  requireValue(Array.isArray(recipe.args) && recipe.args.length && recipe.args.every(a => typeof a === 'string' && !a.includes('\0')) &&
    ['{train}','{validation}','{output}','{model}'].every(p => recipe.args.includes(p)) &&
    !recipe.args.some(a => /evaluation\.jsonl|\{evaluation\}/i.test(a)), 'trainer must consume model/train/validation and output only');
  requireValue(Array.isArray(recipe.artifacts) && new Set(recipe.artifacts.map(a=>a?.path)).size===recipe.artifacts.length,
    'explicit trainer dependency artifact bindings required');
  for(const artifact of recipe.artifacts) requireValue(isAbsolute(artifact?.path) && existsSync(artifact.path) &&
    realpathSync(artifact.path)===artifact.path && statSync(artifact.path).isFile() && /^[a-f0-9]{64}$/.test(artifact.sha256) &&
    hashTrainingFile(artifact.path)===artifact.sha256,'trainer dependency artifact changed');
  requireValue(recipe.args.filter(a=>isAbsolute(a)).every(a=>recipe.artifacts.some(f=>f.path===a)),
    'literal script/config paths require approved artifact hashes');
  requireValue(Number.isInteger(recipe.timeoutMs) && recipe.timeoutMs >= 100 && recipe.timeoutMs <= 3600000 &&
    Number.isInteger(recipe.seed) && recipe.seed >= 0 && typeof recipe.resources === 'string' && recipe.resources.trim(), 'bounded run/seed/resource declaration required');
  requireValue(typeof recipe.checkpoint === 'string' && /^[A-Za-z0-9_.-]+$/.test(recipe.checkpoint) && !['.','..'].includes(recipe.checkpoint), 'single local checkpoint filename required');
  return trainingHash(JSON.stringify(recipe));
}
export async function runPrivateTraining(root,{exportDir,recipe,decisionId,destination,purpose},spawnTrainer=spawn) {
  const receipt=validateTrainingExport(root,exportDir), recipeFingerprint=validateLocalTrainingRecipe(recipe);
  assertPrivateTrainingPath(destination); const proposed=resolve(destination), dataset=realpathSync(exportDir);
  const out=proposed;
  const rel=relative(dataset,out); requireValue(rel === '..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel),'model output overlaps dataset');
  // The trusted canonical grant must approve this exact recipe, export and model output before process creation.
  const expected={fingerprint:receipt.plan.fingerprint,exportFingerprint:receipt.exportFingerprint,
    recipeFingerprint,tenantId:receipt.plan.tenantId,destination:out,purpose,baseModel:recipe.baseModel};
  const runGrant=trainingApproval(root,decisionId,'Training-run',expected);
  const exportGrant=trainingApproval(root,receipt.decisionId,'Training-export',{fingerprint:receipt.plan.fingerprint,
    tenantId:receipt.plan.tenantId,destination:dataset,purpose:receipt.purpose,taskFormat:receipt.plan.taskFormat});
  requireValue(Math.min(Date.parse(runGrant.expiresAt),Date.parse(exportGrant.expiresAt)) > Date.now()+recipe.timeoutMs,'approvals must remain valid through bounded run');
  newTrainingDestination(out);trainingOutputOutsideCorpus(root,out);
  const substitutions={'{train}':join(dataset,'train.jsonl'),'{validation}':join(dataset,'validation.jsonl'),'{output}':out,'{model}':recipe.baseModelPath};
  const args=recipe.args.map(a=>substitutions[a]??a);
  mkdirSync(out,{mode:0o700});
  const startedAt=new Date().toISOString(), stdout=createHash('sha256'),stderr=createHash('sha256');
  let stdoutBytes=0,stderrBytes=0,result;
  const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  env.TRAINING_SEED=String(recipe.seed);env.HF_HUB_OFFLINE='1';env.TRANSFORMERS_OFFLINE='1';env.WANDB_DISABLED='true';
  try {
    result=await new Promise((done,reject)=>{
      const child=spawnTrainer(recipe.executable,args,{cwd:out,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:recipe.timeoutMs,killSignal:'SIGKILL'});
      child.stdout.on('data',b=>{stdout.update(b);stdoutBytes+=b.length;}); child.stderr.on('data',b=>{stderr.update(b);stderrBytes+=b.length;});
      child.once('error',reject);child.once('close',(code,signal)=>done({code,signal}));
    });
  } catch {result={code:null,signal:'launch-error'};}
  const checkpoint=join(out,recipe.checkpoint), completed=result.code===0 && existsSync(checkpoint) &&
    realpathSync(checkpoint)===checkpoint && statSync(checkpoint).isFile() && statSync(checkpoint).size>0;
  const report={format:'private-training-run-v1',status:completed?'trainer-completed-unverified-checkpoint':'training-failed',
    planFingerprint:receipt.plan.fingerprint,exportFingerprint:receipt.exportFingerprint,recipeFingerprint,decisionId,
    executionEvidence:spawnTrainer===spawn?'local-process':'injected-test-runner',hostPlatform:process.platform,
    baseModel:recipe.baseModel,baseModelSha256:recipe.baseModelSha256,startedAt,finishedAt:new Date().toISOString(),
    process:result,stdout:{bytes:stdoutBytes,sha256:stdout.digest('hex')},stderr:{bytes:stderrBytes,sha256:stderr.digest('hex')},
    checkpoint:completed?{file:recipe.checkpoint,sha256:hashTrainingFile(checkpoint)}:null,
    privacy:'local-only requested; approved trainer must be independently audited for network behavior',
    trainedModelVerified:false,inferenceVerified:false,evaluated:false,promoted:false};
  writeFileSync(join(out,'training-run.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  return report;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{const o=trainingArguments(process.argv.slice(2),['--export','--recipe','--decision','--destination','--purpose']);
    const r=await runPrivateTraining(TRAINING_ROOT,{exportDir:o['--export'],recipe:readTrainingJson(o['--recipe']),decisionId:o['--decision'],destination:o['--destination'],purpose:o['--purpose']});
    console.log(JSON.stringify({status:r.status,evaluated:false,promoted:false}));if(r.status==='training-failed')process.exitCode=2;
  }catch{console.error('private training refused; exact recipe/export/output Umesh approval and local host required');process.exitCode=2;}
}
