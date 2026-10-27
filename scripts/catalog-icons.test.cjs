const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const context={exports:{},Map,decodeURIComponent};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/catalog-icons.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
const {catalogIcons,catalogIconSrc}=context.exports;
test('all 69 supplied icons resolve by handle and title with real local SVG assets',()=>{
 assert.equal(catalogIcons.filter(icon=>icon.kind==='category').length,12);assert.equal(catalogIcons.filter(icon=>icon.kind==='subcategory').length,57);
 assert.equal(new Set(catalogIcons.map(icon=>icon.src)).size,69);
 for(const icon of catalogIcons){assert.equal(catalogIconSrc(icon.kind,icon.handle),icon.src);assert.equal(catalogIconSrc(icon.kind,undefined,icon.title),icon.src);const svg=fs.readFileSync(path.join('public',icon.src),'utf8');assert.match(svg,/<svg\b/);assert.match(svg,/viewBox="0 0 64 64"/);assert.doesNotMatch(svg,/<script|<foreignObject|(?:href|src)="(?:https?:|javascript:)/i);}
});
test('encoded ampersand categories and existing and aliases resolve consistently',()=>{
 for(const handle of ['computer-%26-mobile-accessories','computer-and-mobile-accessories'])assert.equal(catalogIconSrc('category',handle),catalogIconSrc('category','computer-&-mobile-accessories'));
 assert.ok(catalogIconSrc('category','surveillance-%26-security'));
});
test('similar named catalog entries retain their own asset mappings',()=>{
 for(const [a,b] of [['home-appliances-kettle','home-appliances-kettles'],['kitchen-appliances-pressure-cooker','kitchen-appliances-pressure-cookers'],['home-appliances-knife-set','kitchen-appliances-knife-sets']])assert.notEqual(catalogIconSrc('subcategory',a),catalogIconSrc('subcategory',b));
 for(const handle of ['kitchen-appliances-hand-blenders','kitchen-appliances-coffee-maker','hardware-electric-plug','clothing-women-s-bra','clothing-women-s-camisole-slips','clothing-women-s-shapewear'])assert.ok(catalogIconSrc('subcategory',handle));
});
test('unknown categories leave existing fallback icons available',()=>{assert.equal(catalogIconSrc('category','unknown'),undefined);assert.equal(catalogIconSrc('subcategory','unknown'),undefined)});
