import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {ObjectId,type Db} from 'mongodb';
import {createWhatsAppSource} from '@lkb/ingest';
import type {createMongoWhatsAppDeps as StoreFactory} from './store.js';

test('actual owner-qualified Mongo reader captures one ID/payload snapshot before archive mutation',async()=>{
 const A='111111111111111111111111',B='222222222222222222222222',oid=(s:string)=>new ObjectId(s),hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 const people=[{_id:oid('aaaaaaaaaaaaaaaaaaaaaaaa'),ownerUserId:oid(A),displayName:'Alice 😀'},{_id:oid('bbbbbbbbbbbbbbbbbbbbbbbb'),ownerUserId:oid(A),displayName:'Bob 世界'},{_id:oid('cccccccccccccccccccccccc'),ownerUserId:oid(B),displayName:'Foreign fixture'}];
 const messages=[
  {_id:oid('dddddddddddddddddddddddd'),ownerUserId:oid(A),groupJid:'same',messageId:'a-first',personId:people[0]!._id,text:'First literal 世界',ts:new Date('2026-10-09T01:00:00Z'),deletedAt:null},
  {_id:oid('eeeeeeeeeeeeeeeeeeeeeeee'),ownerUserId:oid(A),groupJid:'same',messageId:'a-second',personId:people[1]!._id,text:'Second literal 😀',ts:new Date('2026-10-09T01:01:00Z'),deletedAt:null},
  {_id:oid('ffffffffffffffffffffffff'),ownerUserId:oid(B),groupJid:'same',messageId:'b-foreign',personId:people[2]!._id,text:'Foreign fixture literal',ts:new Date('2026-10-09T00:59:00Z'),deletedAt:null},
 ];
 const rows:Record<string,any[]>={messages,people,groups:[{ownerUserId:oid(A),jid:'same',subject:'Fixture A',isTracked:true},{ownerUserId:oid(B),jid:'same',subject:'Fixture B',isTracked:true}],tracking:[{ownerUserId:oid(A),groupJid:'same'},{ownerUserId:oid(B),groupJid:'same'}]};
 const queries:Array<{name:string;filter:any}>=[],writes:Array<{name:string;filter:any;row:any}>=[];let connections=0,mutated=false;
 const eq=(a:any,b:any)=>a?.toString()===b?.toString();
 const archive={collection(name:string){return {find(filter:any){queries.push({name,filter});let ordering:any;return {sort(order:any){ordering=order;return this},async toArray(){const selected=(rows[name]??[]).filter(row=>Object.entries(filter).every(([k,v]:[string,any])=>v&&typeof v==='object'&&'$in'in v?v.$in.some((id:any)=>eq(row[k],id)):v&&typeof v==='object'&&'$ne'in v?row[k]!==v.$ne:eq(row[k],v)));if(ordering)selected.sort((a,b)=>a.ts.getTime()-b.ts.getTime()||a._id.toString().localeCompare(b._id.toString()));return selected;}}}}}};
 const appDb=()=>({collection:(name:string)=>({replaceOne:async(filter:any,row:any)=>{
  writes.push({name,filter,row});
  if(!mutated){mutated=true;messages.reverse();for(const message of messages){message.messageId='changed-'+message.messageId;message.text='changed archive payload';message.ts.setUTCFullYear(2030)}people[0]!.displayName='changed archive label';}
 },bulkWrite:async(ops:any[])=>{for(const op of ops)writes.push({name,filter:op.replaceOne.filter,row:op.replaceOne.replacement})}})}) as unknown as Db;
 const exports:Record<string,unknown>={};
 const modules:Record<string,unknown>={mongodb:{ObjectId,MongoClient:class {async connect(){connections++}db(){return archive}}},'@lkb/db':{getDb:()=>{throw new Error('Real app DB forbidden')}},'@lkb/ingest':{createWhatsAppSource},'../hash.js':{sha256Hex:hash}};
 const code=ts.transpileModule(readFileSync(new URL('./store.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:(name:string)=>{assert(Object.hasOwn(modules,name),'Unexpected dependency '+name);return modules[name]},Date,Map,Set,console,process:{env:{}}});
 const createStore=exports.createMongoWhatsAppDeps as typeof StoreFactory;
 const store=createStore(undefined,{resolveOwner:async tenant=>tenant==='a'?A:null,appDb});
 const result=await store.ingestGroup('a','same');
 assert.equal(connections,1);assert.equal(queries.filter(q=>q.name==='messages').length,1);assert.equal(queries.filter(q=>q.name==='people').length,1);
 for(const query of queries)assert.equal(query.filter.ownerUserId.toHexString(),A);
 assert.equal(queries.find(q=>q.name==='messages')!.filter.groupJid,'same');
 const turns=writes.filter(w=>w.name==='turns').map(w=>w.row);
 assert.equal(turns.length,2);assert.equal(result.turnCount,2);
 assert.deepEqual(turns.map(t=>({_id:t._id,text:t.text,speakerRef:t.speakerRef,speakerLabel:t.speakerLabel,occurredAt:t.occurredAt,tStart:t.tStart,tEnd:t.tEnd})),[
  {_id:hash(`${result.sessionId}:a-first`),text:'First literal 世界',speakerRef:'aaaaaaaaaaaaaaaaaaaaaaaa',speakerLabel:'Alice 😀',occurredAt:'2026-10-09T01:00:00.000Z',tStart:0,tEnd:0},
  {_id:hash(`${result.sessionId}:a-second`),text:'Second literal 😀',speakerRef:'bbbbbbbbbbbbbbbbbbbbbbbb',speakerLabel:'Bob 世界',occurredAt:'2026-10-09T01:01:00.000Z',tStart:60,tEnd:60},
 ]);
 assert.equal(writes.find(w=>w.name==='sessions')!.row.date,'2026-10-09');
 assert.equal(writes.find(w=>w.name==='sources')!.row.consent.recordedBy,'whatsapp-owner:'+A);
 for(const write of writes){assert.equal(write.filter.tenantId,'a');assert.equal(write.row.tenantId,'a')}
});
