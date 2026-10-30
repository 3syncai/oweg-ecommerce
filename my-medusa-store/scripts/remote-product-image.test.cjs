const { test } = require("node:test"), assert = require("node:assert/strict")
const fs = require("node:fs"), ts = require("typescript"), { EventEmitter } = require("node:events")
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
const { isPublicImageAddress, remoteImageUrl, imageFileType, downloadPublicImage, resolveRemoteProductImage, RemoteImageInputError } = require("../src/lib/remote-product-image.ts")
const jpeg = Buffer.from([255,216,255,224,0,16])

test("private/reserved addresses and unsafe protocols, ports and credentials are rejected", () => {
  for (const address of ["127.0.0.1","10.0.0.1","100.64.0.1","169.254.169.254","172.16.0.1","192.168.1.1","0.0.0.0","224.0.0.1","::1","::ffff:127.0.0.1","fc00::1","fe80::1","2001:db8::1","2002:7f00:1::"]) assert.equal(isPublicImageAddress(address),false,address)
  for (const address of ["8.8.8.8","1.1.1.1","2606:4700:4700::1111"]) assert.equal(isPublicImageAddress(address),true,address)
  for (const url of ["file:///tmp/photo.jpg","http://localhost/a.jpg","http://2130706433/a.jpg","http://[::1]/a.jpg","https://example.com:8080/a.jpg","https://u:p@example.com/a.jpg"]) assert.throws(()=>remoteImageUrl(url),RemoteImageInputError)
})
test("only supported raster image signatures are accepted", () => {
  assert.equal(imageFileType(jpeg).mime,"image/jpeg")
  assert.equal(imageFileType(Buffer.from("<svg></svg>")),null)
  assert.equal(imageFileType(Buffer.from("<html>not image</html>")),null)
})
test("HTTP prefers working HTTPS without creating a storage object", async () => {
  const calls=[]
  const result=await resolveRemoteProductImage("http://example.com/Photo.JPG?Sig=AbC",async()=>assert.fail("unnecessary upload"),async(url,secure)=>{calls.push([url,secure]);return {url,bytes:jpeg,mime:"image/jpeg",extension:"jpg"}})
  assert.deepEqual(calls,[["https://example.com/Photo.JPG?Sig=AbC",true]])
  assert.equal(result.stored,false);assert.ok(result.url.startsWith("https:"))
})
test("HTTP-only images are stored, and HTTPS sources never silently downgrade", async () => {
  const calls=[]
  const download=async url=>{calls.push(url);if(url.startsWith("https:"))throw Error("TLS unavailable");return {url,bytes:jpeg,mime:"image/jpeg",extension:"jpg"}}
  const result=await resolveRemoteProductImage("http://example.com/photo.jpg",async image=>{assert.deepEqual(image.bytes,jpeg);return {url:"https://owned.example.com/photo.jpg",key:"photo.jpg"}},download)
  assert.equal(result.stored,true);assert.equal(calls.length,2)
  calls.length=0
  await assert.rejects(resolveRemoteProductImage("https://example.com/photo.jpg",async()=>assert.fail("upload"),download),/TLS/)
  assert.equal(calls.length,1)
})
test("unsafe DNS answers fail before making a network request", async t => {
  const dns=require("node:dns/promises")
  t.mock.method(dns,"lookup",async()=>[{address:"127.0.0.1",family:4}])
  await assert.rejects(downloadPublicImage("https://example.com/a.jpg"),RemoteImageInputError)
})
test("redirects to internal hosts are rejected and the socket uses pinned DNS", async t => {
  const dns=require("node:dns/promises"), https=require("node:https")
  t.mock.method(dns,"lookup",async()=>[{address:"1.1.1.1",family:4}])
  let requests=0
  t.mock.method(https,"request",(_url,options,callback)=>{
    requests++
    options.lookup("example.com",{},(error,address)=>{assert.equal(error,null);assert.equal(address,"1.1.1.1")})
    options.lookup("example.com",{all:true},(error,addresses)=>{assert.equal(error,null);assert.deepEqual(addresses,[{address:"1.1.1.1",family:4}])})
    const req=new EventEmitter(),res=new EventEmitter()
    res.statusCode=302;res.headers={location:"http://169.254.169.254/latest/meta-data"};res.destroy=()=>{}
    req.end=()=>queueMicrotask(()=>{callback(res);req.emit("close")})
    req.destroy=error=>req.emit("error",error)
    return req
  })
  await assert.rejects(downloadPublicImage("https://example.com/a.jpg"),RemoteImageInputError)
  assert.equal(requests,1)
})
test("oversized downloads are stopped even before body buffering", async t => {
  const dns=require("node:dns/promises"),https=require("node:https")
  t.mock.method(dns,"lookup",async()=>[{address:"1.1.1.1",family:4}])
  t.mock.method(https,"request",(_url,_options,callback)=>{
    const req=new EventEmitter(),res=new EventEmitter()
    res.statusCode=200;res.headers={"content-type":"image/jpeg","content-length":String(11*1024*1024)};res.destroy=()=>{}
    req.end=()=>queueMicrotask(()=>{callback(res);req.emit("close")});req.destroy=error=>req.emit("error",error)
    return req
  })
  await assert.rejects(downloadPublicImage("https://example.com/a.jpg"),/10 MB/)
})
test("stream size is enforced without Content-Length", async t => {
  const dns=require("node:dns/promises"),https=require("node:https")
  t.mock.method(dns,"lookup",async()=>[{address:"1.1.1.1",family:4}])
  t.mock.method(https,"request",(_url,_options,callback)=>{
    const req=new EventEmitter(),res=new EventEmitter()
    res.statusCode=200;res.headers={"content-type":"image/jpeg"}
    res.destroy=error=>{if(error)res.emit("error",error)}
    req.end=()=>queueMicrotask(()=>{callback(res);res.emit("data",Buffer.alloc(10*1024*1024+1));req.emit("close")})
    req.destroy=error=>req.emit("error",error)
    return req
  })
  await assert.rejects(downloadPublicImage("https://example.com/a.jpg"),/10 MB/)
})
