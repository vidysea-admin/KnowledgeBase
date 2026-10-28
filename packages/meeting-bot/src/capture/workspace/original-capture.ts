import {createHash} from "node:crypto";
import {createReadStream,lstatSync,realpathSync,type BigIntStats} from "node:fs";
import path from "node:path";

const canonical=(value:string)=>process.platform==="win32"?value.toLowerCase():value;
const same=(a:BigIntStats,b:BigIntStats)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs;
/** Bind a retained original to only its own lossless WebM remux within the actual slot. */
export async function bindOriginalCapture(original:string,selected:string,recordDir:string){
  const root=path.resolve(recordDir),file=path.resolve(original),relative=path.relative(root,file);
  if(!path.isAbsolute(original)||/^[/\\]{2}/.test(original)||!relative||relative===".."||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error("Original capture outside actual slot");
  const expected=file.endsWith(".webm")?file.slice(0,-5)+".playable.webm":file;
  if(!path.isAbsolute(selected)||(canonical(path.resolve(selected))!==canonical(file)&&canonical(path.resolve(selected))!==canonical(expected)))throw new Error("Original capture does not match selected remux");
  const physical=()=>{
    for(let current=file;;current=path.dirname(current)){
      const stat=lstatSync(current,{bigint:true});
      if(stat.isSymbolicLink()||canonical(realpathSync(current))!==canonical(current))throw new Error("Original capture alias refused");
      if(current!==file&&!stat.isDirectory())throw new Error("Original capture ancestor refused");
      if(path.dirname(current)===current)break;
    }
    const stat=lstatSync(file,{bigint:true});
    if(!stat.isFile()||stat.nlink!==1n||stat.size<=0n||stat.size>8n*1024n**3n)throw new Error("Original capture outside media bounds");
    return stat;
  };
  const before=physical();
  const digest=async()=>{
    const hash=createHash("sha256");let size=0n;
    for await(const chunk of createReadStream(file)){size+=BigInt(chunk.length);if(size>before.size)throw new Error("Original capture changed");hash.update(chunk);}
    if(size!==before.size||!same(before,physical()))throw new Error("Original capture changed");
    return hash.digest("hex");
  };
  const sha256=await digest();
  return {file,sha256,verify:async()=>{if(await digest()!==sha256)throw new Error("Original capture bytes changed");}};
}
