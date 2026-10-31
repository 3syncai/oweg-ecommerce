const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,mocks={}){
  const filename=path.resolve(file),module={exports:{}},local=createRequire(filename);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,
    {module,exports:module.exports,require:key=>key in mocks?mocks[key]:local(key),URLSearchParams,console});
  return module.exports;
}
const selection=load('src/lib/product-variant-selection.ts');
const labels=load('src/lib/cart-variant-label.ts');
const product={id:'prod',title:'Comfort Bra',price:324,mrp:364,discount:11,currency:'INR',images:[],categories:[],tags:[],highlights:[],variant_id:'v30',
  options:[{id:'colour',title:'Color',values:['Assorted']},{id:'size',title:'Size',values:['30B','32B','44C']}],
  variants:[{id:'v30',title:'Assorted / 30B',options:{Color:'Assorted',Size:'30B'},price:324,mrp:364,discount:11,inventory_quantity:20},
    {id:'v32',title:'Assorted / 32B',options:{Color:'Assorted',Size:'32B'},price:340,mrp:400,discount:15,inventory_quantity:10},
    {id:'v44',title:'Assorted / 44C',options:{Color:'Assorted',Size:'44C'},price:350,mrp:400,discount:13,inventory_quantity:0}]};
test('multiple sizes have no automatic size selection or fallback to the first variant',()=>{
  const initial=selection.initialProductOptions(product);
  assert.equal(initial.Color,'Assorted');assert.equal(initial.Size,undefined);
  assert.equal(selection.selectedProductVariant(product,initial),null);
  assert.equal(selection.selectedProductVariant(product,{Color:'Assorted',Size:'missing'}),null);
  const chosen=selection.selectedProductVariant(product,{Color:'Assorted',Size:'32B'});
  assert.equal(chosen.id,'v32');assert.equal(chosen.price,340);
});
test('single variants stay directly purchasable; optionless multiple variants require an explicit choice',()=>{
  assert.equal(selection.selectedProductVariant({...product,variants:[product.variants[0]]},{}).id,'v30');
  assert.equal(selection.selectedProductVariant({...product,options:[]},{}),null);
  assert.equal(selection.selectedProductVariant({...product,options:[]},{},'v32').id,'v32');
});
test('changing one option clears incompatible choices rather than silently picking a replacement size',()=>{
  const p={options:[{title:'Color',values:['Black','White']},{title:'Size',values:['S','L']}],variants:[{id:'black-s',options:{Color:'Black',Size:'S'}},{id:'white-l',options:{Color:'White',Size:'L'}}]};
  const next=selection.changeProductOption(p,{Color:'Black',Size:'S'},'Color','White');
  assert.equal(next.Color,'White');assert.equal(next.Size,undefined);
  assert.equal(selection.selectedProductVariant(p,next),null);
});
test('cart and checkout labels use the chosen line attributes and hide the default variant',()=>{
  assert.equal(labels.cartVariantLabel({variant_title:'Assorted / 32B'}),'Assorted / 32B');
  assert.equal(labels.cartVariantLabel({variant:{title:'Default variant'}}),'');
  assert.equal(labels.cartVariantLabel({variant:{options:[{value:'32B',option:{title:'Size'}},{value:'Black',option:{title:'Color'}}]}}),'Size: 32B · Color: Black');
  assert.equal(labels.cartVariantLabel({variant_option_values:{Size:'32B',Color:'Black'}}),'Size: 32B · Color: Black');
});
const Summary=load('src/app/productDetail/components/ProductSummary.tsx',{
  'lucide-react':new Proxy({},{get:()=>()=>null}),
  '@/lib/medusa':{isVariantPurchasable:v=>v.inventory_quantity>0,resolveColorImageUrls:()=>[]},
  '@/components/flash-sale/FlashSaleBadge':{FlashSaleBadge:()=>null},
  '../ProductDetail.module.css':new Proxy({},{get:(_,key)=>String(key)}),
}).default;
function summaryHTML(selectionRequired,hasStock){return renderToStaticMarkup(React.createElement(Summary,{product,selectionRequired,hasStock,brandName:'Gossip',quantity:1,maxQuantity:10,selectedOptions:{Color:'Assorted'},formatPrice:String}));}
test('both purchase actions are disabled until selection, and remain disabled for unavailable variants',()=>{
  for(const [pending,stock,disabled] of [[true,true,true],[false,false,true],[false,true,false]]){
    const html=summaryHTML(pending,stock);
    const actions=[...html.matchAll(/<button([^>]+)>[\s\S]*?(Add to cart|Buy now)<\/button>/g)];
    // Inspect button HTML individually so preceding option buttons cannot match across purchase actions.
    const buttons=html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)||[];
    const purchase=buttons.filter(b=>/Add to cart|Buy now/.test(b));
    assert.equal(purchase.length,2);
    for(const button of purchase)assert.equal(button.includes('disabled=""'),disabled);
    if(pending)assert.match(html,/Select options to check availability/);
    assert.ok(actions.length);
  }
});
