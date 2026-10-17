const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const ts=require('typescript');const {Pool}=require('pg');
require('@next/env').loadEnvConfig(process.cwd());
exports.createHarness=async()=>{
 const schema='qa_payment_reliable_'+crypto.randomBytes(8).toString('hex');
 const original=process.env.DATABASE_URL;if(!original)throw Error('DATABASE_URL required');
 const ssl=original.includes('amazonaws.com')?{rejectUnauthorized:false}:undefined;
 const admin=new Pool({connectionString:original,ssl});await admin.query('CREATE SCHEMA '+schema);
 const url=new URL(original);url.searchParams.set('options','-csearch_path='+schema);
 const pool=new Pool({connectionString:url.toString(),ssl});
 const cache=new Map();
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);
   const output={};cache.set(file,output);
   const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
   vm.runInNewContext(js,{exports:output,require:name=>{
     if(name==='pg')return {Pool:class{constructor(){return {query:pool.query.bind(pool),connect:pool.connect.bind(pool),end:async()=>undefined};}}};
     if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts');
     if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+(path.extname(name)?'':'.ts'));
     return require(name);
   },process:{env:{...process.env,DATABASE_URL:url.toString()}},console,Error,Buffer,setTimeout,clearTimeout,URL,AbortSignal,fetch:(...args)=>globalThis.fetch(...args)});return output;
 }
 load.stub=(file,value)=>cache.set(path.resolve(file),value);
 return {pool,load,cleanup:async()=>{await pool.end();if(!/^qa_payment_reliable_[a-f0-9]{16}$/.test(schema))throw Error('Unsafe test schema');await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}};
};
