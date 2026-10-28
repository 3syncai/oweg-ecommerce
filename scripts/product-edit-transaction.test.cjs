const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const load = createRequire(path.join(root, 'my-medusa-store/package.json'));
const ts = load('typescript');
load.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { saveVendorProductEdit, productEditContext } = load('./src/lib/vendor-product-edit.ts');
const url = process.env.PRODUCT_EDIT_TEST_DATABASE_URL;
const enabled = Boolean(url);
if (enabled) {
  const parsed = new URL(url);
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55439' || parsed.pathname !== '/postgres') throw new Error('Only the disposable localhost:55439/postgres database is permitted');
}

async function fixture(run, failure) {
  const knex = load('knex')({ client: 'pg', connection: url });
  const schema = 'qa_product_edit_' + require('node:crypto').randomBytes(8).toString('hex');
  await knex.raw(`CREATE SCHEMA ${schema}`);
  const db = load('knex')({ client: 'pg', connection: url, searchPath: [schema] });
  try {
    await db.raw(`
      CREATE TABLE product(id text PRIMARY KEY,title text,metadata jsonb,status text,deleted_at timestamptz,updated_at timestamptz,thumbnail text);
      CREATE TABLE product_variant(id text PRIMARY KEY,product_id text,title text,sku text UNIQUE,manage_inventory boolean DEFAULT true,allow_backorder boolean DEFAULT false,created_at timestamptz DEFAULT now(),deleted_at timestamptz,thumbnail text);
      CREATE TABLE product_option(id text PRIMARY KEY,product_id text,title text,deleted_at timestamptz);
      CREATE TABLE product_variant_price_set(id text PRIMARY KEY,variant_id text,price_set_id text,deleted_at timestamptz);
      CREATE TABLE price_set(id text PRIMARY KEY);
      CREATE TABLE price(id text PRIMARY KEY,price_set_id text,currency_code text,price_list_id text,amount numeric,raw_amount jsonb,deleted_at timestamptz,updated_at timestamptz);
      CREATE TABLE price_list(id text PRIMARY KEY,title text,status text,deleted_at timestamptz,created_at timestamptz DEFAULT now());
      CREATE TABLE inventory_item(id text PRIMARY KEY,sku text,updated_at timestamptz);
      CREATE TABLE product_variant_inventory_item(id text PRIMARY KEY,variant_id text,inventory_item_id text,required_quantity int,deleted_at timestamptz);
      CREATE TABLE inventory_level(id text PRIMARY KEY,inventory_item_id text,location_id text,stocked_quantity numeric,reserved_quantity numeric DEFAULT 0,deleted_at timestamptz);
      CREATE TABLE stock_location(id text PRIMARY KEY,created_at timestamptz DEFAULT now(),deleted_at timestamptz);
      CREATE TABLE reservation_item(id text PRIMARY KEY,inventory_item_id text,deleted_at timestamptz);
    `);
    await db('product').insert({ id: 'prod_1', title: 'Original', metadata: { vendor_id: 'vendor_1', approval_status: 'approved' }, status: 'published' });
    await db('product_variant').insert({ id: 'var_1', product_id: 'prod_1', title: 'Default variant', sku: 'OLD' });
    await db('price_set').insert({ id: 'ps_1' });
    await db('product_variant_price_set').insert({ id: 'link_1', variant_id: 'var_1', price_set_id: 'ps_1' });
    await db('price').insert([{ id: 'price_base', price_set_id: 'ps_1', currency_code: 'inr', amount: 100 }, { id: 'price_sale', price_set_id: 'ps_1', currency_code: 'inr', price_list_id: 'pl_1', amount: 80 }]);
    await db('price_list').insert({ id: 'pl_1', status: 'active' });
    await db('inventory_item').insert({ id: 'inv_1', sku: 'OLD' });
    await db('product_variant_inventory_item').insert({ id: 'ilink_1', variant_id: 'var_1', inventory_item_id: 'inv_1', required_quantity: 1 });
    await db('inventory_level').insert({ id: 'level_1', inventory_item_id: 'inv_1', location_id: 'loc_1', stocked_quantity: 10 });
    await db('stock_location').insert({ id: 'loc_1' });
    const emitted = [];
    const base = () => ({ getFreshManager: () => ({ setTransactionContext(trx) { this.trx = trx; } }) });
    const tx = context => { assert.ok(context.transactionManager.trx.isTransaction); return context.transactionManager.trx; };
    const products = {
      baseRepository_: base(),
      async updateProductVariants(id, data, ctx) { data = { ...data }; delete data.options; await tx(ctx)('product_variant').where({ id }).update(data); return tx(ctx)('product_variant').where({ id }).first(); },
      async createProductVariants(data, ctx) { const row = { id: 'var_new', ...data }; delete row.options; await tx(ctx)('product_variant').insert(row); return tx(ctx)('product_variant').where({ id: row.id }).first(); },
      async updateProductOptions(id, data, ctx) { tx(ctx); return { id, ...data }; },
      async createProductOptions(data, ctx) { const row = { id: 'opt_1', product_id: data.product_id, title: data.title }; await tx(ctx)('product_option').insert(row); return row; },
      async softDeleteProductVariants(ids, ctx) { await tx(ctx)('product_variant').whereIn('id', ids).update({ deleted_at: new Date() }); },
      async softDeleteProductOptions(ids, ctx) { await tx(ctx)('product_option').whereIn('id', ids).update({ deleted_at: new Date() }); },
      async updateProducts(id, data, ctx) {
        const row = { title: data.title, metadata: JSON.stringify(data.metadata), status: data.status };
        await tx(ctx)('product').where({ id }).update(row);
        ctx.messageAggregator.save({ name: 'product.updated', data: { id } });
        if (failure === 'product') throw new Error('injected product failure');
      },
      async retrieveProduct(id, config, ctx) { return tx(ctx)('product').where({ id }).first(); },
      async emitEvents_(events) { assert.equal((await db('product').first()).status, 'draft'); emitted.push(events); },
    };
    const inventory = {
      baseRepository_: base(),
      async createInventoryItems(data, ctx) { const item = { id: 'inv_new', sku: data.sku || null }; await tx(ctx)('inventory_item').insert(item); return item; },
      async createInventoryLevels(data, ctx) { await tx(ctx)('inventory_level').insert({ id: 'level_new', ...data }); },
      async updateInventoryItems(data, ctx) { await tx(ctx)('inventory_item').where({ id: data.id }).update({ sku: data.sku }); },
      async updateInventoryLevels(data, ctx) { await tx(ctx)('inventory_level').where({ inventory_item_id: data.inventory_item_id, location_id: data.location_id }).update({ stocked_quantity: data.stocked_quantity }); if (failure === 'stock') throw new Error('injected inventory failure'); },
    };
    const req = { scope: { resolve(name) { return { __pg_connection__: db, product: products, inventory }[name]; } } };
    await run({ db, req, emitted, schema });
  } finally { await db.destroy(); await knex.raw(`DROP SCHEMA ${schema} CASCADE`); await knex.destroy(); }
}
const edit = { title: 'Edited', vendor_edit_remark: 'Update details and inventory', variants: [{ id: 'var_1', sku: 'NEW', inventory_quantity: 7, price: 120, discounted_price: null }] };

test('unsupported module transaction support fails rather than performing non-atomic writes', () => {
  assert.throws(() => productEditContext({}, {}, {}), /transaction context support/);
});
test('single-product SKU, stock, prices and approval persist together, and cleared sale is absent on reload', { skip: !enabled }, async () => fixture(async ({ db, req, emitted }) => {
  await saveVendorProductEdit(req, 'prod_1', 'vendor_1', edit);
  assert.equal((await db('product').first()).title, 'Edited');
  assert.equal((await db('product_variant').first()).sku, 'NEW');
  assert.equal((await db('inventory_item').first()).sku, 'NEW');
  assert.equal(Number((await db('inventory_level').first()).stocked_quantity), 7);
  assert.equal(Number((await db('price').whereNull('price_list_id').first()).amount), 120);
  assert.equal((await db('price').whereNotNull('price_list_id').whereNull('deleted_at')).length, 0);
  assert.equal((await db('product').first()).metadata.approval_status, 'pending');
  assert.equal(emitted.length, 1);
}));
for (const failure of ['stock', 'product']) test(`${failure} failure rolls back every earlier SKU, stock, price and product write`, { skip: !enabled }, async () => fixture(async ({ db, req, emitted }) => {
  await assert.rejects(saveVendorProductEdit(req, 'prod_1', 'vendor_1', edit), /injected/);
  assert.equal((await db('product').first()).title, 'Original');
  assert.equal((await db('product').first()).status, 'published');
  assert.equal((await db('product_variant').first()).sku, 'OLD');
  assert.equal((await db('inventory_item').first()).sku, 'OLD');
  assert.equal(Number((await db('inventory_level').first()).stocked_quantity), 10);
  assert.equal(Number((await db('price').whereNull('price_list_id').first()).amount), 100);
  assert.equal((await db('price').whereNotNull('price_list_id').whereNull('deleted_at')).length, 1);
  assert.equal(emitted.length, 0);
}, failure));
test('omitted sale price is preserved when changing SKU and stock', { skip: !enabled }, async () => fixture(async ({ db, req }) => {
  await saveVendorProductEdit(req, 'prod_1', 'vendor_1', { variants: [{ id: 'var_1', sku: 'NEW', inventory_quantity: 5 }] });
  assert.equal(Number((await db('price').whereNotNull('price_list_id').whereNull('deleted_at').first()).amount), 80);
}));
test('invalid sale price rolls back variant edits', { skip: !enabled }, async () => fixture(async ({ db, req }) => {
  await assert.rejects(saveVendorProductEdit(req, 'prod_1', 'vendor_1', { variants: [{ id: 'var_1', sku: 'NEW', discounted_price: 100 }] }), /lower than MRP/);
  assert.equal((await db('product_variant').first()).sku, 'OLD');
}));
test('cross-vendor product edits and foreign variant IDs are rejected without changes', { skip: !enabled }, async () => fixture(async ({ db, req }) => {
  await assert.rejects(saveVendorProductEdit(req, 'prod_1', 'vendor_other', edit), /does not belong/);
  await assert.rejects(saveVendorProductEdit(req, 'prod_1', 'vendor_1', { variants: [{ id: 'foreign', sku: 'NEW' }] }), /variant ID/);
  assert.equal((await db('product').first()).title, 'Original');
}));
test('stock below reservations is rejected and earlier edits roll back', { skip: !enabled }, async () => fixture(async ({ db, req }) => {
  await db('inventory_level').update({ reserved_quantity: 9 });
  await assert.rejects(saveVendorProductEdit(req, 'prod_1', 'vendor_1', edit), /reserved for orders/);
  assert.equal((await db('product_variant').first()).sku, 'OLD');
}));

test('adding a variant commits its price set, inventory link and stock with the product', { skip: !enabled }, async () => fixture(async ({ db, req }) => {
  await saveVendorProductEdit(req, 'prod_1', 'vendor_1', { title: 'Colors', options: [{ title: 'Color', values: ['Red', 'Blue'] }], variants: [
    { id: 'var_1', sku: 'RED', price: 100, discounted_price: null, options: { Color: 'Red' } },
    { sku: 'BLUE', price: 150, inventory_quantity: 3, discounted_price: null, options: { Color: 'Blue' } },
  ] });
  assert.equal((await db('product_variant')).length, 2);
  assert.equal((await db('product_variant_price_set')).length, 2);
  assert.equal((await db('product_variant_inventory_item')).length, 2);
  assert.equal(Number((await db('inventory_level').where({ inventory_item_id: 'inv_new' }).first()).stocked_quantity), 3);
}));
test('failure rolls back newly created variants, options, prices, inventory and links', { skip: !enabled }, async () => fixture(async ({ db, req }) => {
  await assert.rejects(saveVendorProductEdit(req, 'prod_1', 'vendor_1', { options: [{ title: 'Color', values: ['Red', 'Blue'] }], variants: [
    { id: 'var_1', sku: 'RED', price: 100, options: { Color: 'Red' } },
    { sku: 'BLUE', price: 150, inventory_quantity: 3, options: { Color: 'Blue' } },
  ] }), /injected product failure/);
  assert.equal((await db('product_variant')).length, 1);
  assert.equal((await db('product_option')).length, 0);
  assert.equal((await db('price_set')).length, 1);
  assert.equal((await db('inventory_item')).length, 1);
  assert.equal((await db('product_variant_inventory_item')).length, 1);
}, 'product'));
test('a real MikroORM manager shares the Knex transaction and rolls back with it', { skip: !enabled }, async () => fixture(async ({ db, schema }) => {
  const { MikroORM } = load('@mikro-orm/postgresql');
  const { EntitySchema } = load('@mikro-orm/core');
  const orm = await MikroORM.init({ clientUrl: url, entities: [new EntitySchema({ name: 'EditTransactionProbe', properties: { id: { type: 'string', primary: true } } })] });
  try {
    await assert.rejects(db.transaction(async trx => {
      const ctx = productEditContext({ baseRepository_: { getFreshManager: () => orm.em.fork() } }, trx, {});
      assert.equal(ctx.transactionManager.getTransactionContext(), trx);
      await ctx.transactionManager.execute(`update "${schema}".product set title = ? where id = ?`, ['Changed through manager', 'prod_1']);
      assert.equal((await trx('product').first()).title, 'Changed through manager');
      throw new Error('rollback actual manager');
    }), /rollback actual manager/);
    assert.equal((await db('product').first()).title, 'Original');
  } finally { await orm.close(true); }
}));

test('lowering MRP below an unchanged sale price is rejected atomically', { skip: !enabled }, async () => fixture(async ({ db, req }) => {
  await assert.rejects(saveVendorProductEdit(req, 'prod_1', 'vendor_1', { variants: [{ id: 'var_1', sku: 'NEW', price: 60 }] }), /lower than MRP/);
  assert.equal((await db('product_variant').first()).sku, 'OLD');
  assert.equal(Number((await db('price').whereNull('price_list_id').first()).amount), 100);
}));
test('case-insensitive duplicate SKUs fail before any variant writes', { skip: !enabled }, async () => fixture(async ({ db, req }) => {
  await assert.rejects(saveVendorProductEdit(req, 'prod_1', 'vendor_1', { options: [{ title: 'Color', values: ['Red', 'Blue'] }], variants: [
    { id: 'var_1', sku: 'same', price: 100, options: { Color: 'Red' } },
    { sku: 'SAME', price: 100, options: { Color: 'Blue' } },
  ] }), /Duplicate SKU/);
  assert.equal((await db('product_variant').first()).sku, 'OLD');
  assert.equal((await db('product_option')).length, 0);
}));
test('component inventory cannot be silently overwritten as single-item stock', { skip: !enabled }, async () => fixture(async ({ db, req }) => {
  await db('product_variant_inventory_item').update({ required_quantity: 2 });
  await assert.rejects(saveVendorProductEdit(req, 'prod_1', 'vendor_1', edit), /component inventory/);
  assert.equal((await db('product_variant').first()).sku, 'OLD');
  assert.equal(Number((await db('inventory_level').first()).stocked_quantity), 10);
}));
