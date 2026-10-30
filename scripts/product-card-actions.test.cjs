const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadActions({ line, stock = 3, disabled = false, layout = 'inline' } = {}) {
  const calls = [];
  const jsx = (type, props) => ({ type, props: props || {} });
  const mocks = {
    react: { useEffect: () => {}, useState: value => [value, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/hooks/useCart': { useCartLineByVariant: () => ({ line }) },
    '@/hooks/useCartMutations': {
      useAddToCartWithNotification: () => ({ addToCart: async id => calls.push(['add', id]), isLoading: false }),
      useUpdateCartLineQuantity: () => ({ updateQuantity: async (...args) => calls.push(['quantity', ...args]), isUpdating: false }),
    },
    '@/components/ui/icons/product-actions': {},
    'lucide-react': {},
  };
  const output = ts.transpileModule(fs.readFileSync('src/components/modules/ProductCardQuickActions.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: name => {
    if (!(name in mocks)) throw new Error(name);
    return mocks[name];
  } });
  const tree = module.exports.ProductCardQuickActions({ variantId: 'variant-1', productName: 'Air fryer', inventoryQuantity: stock, disabled, layout, isHovered: false });
  const buttons = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'button') buttons.push(node.props);
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) walk(child);
  }
  walk(tree);
  const event = { preventDefault() { calls.push(['prevent']); }, stopPropagation() { calls.push(['stop']); } };
  return { tree, buttons, calls, event };
}

test('inline cart action is visible without hover and uses the existing variant mutation', async () => {
  const { tree, buttons, calls, event } = loadActions();
  assert.equal(tree.props.style.pointerEvents, 'auto');
  assert.equal(buttons[0].disabled, false);
  await buttons[0].onClick(event);
  assert.deepEqual(calls, [['prevent'], ['stop'], ['add', 'variant-1']]);
});
test('out-of-stock cards cannot add an item', async () => {
  const { buttons, calls, event } = loadActions({ disabled: true, stock: 0 });
  assert.equal(buttons[0].disabled, true);
  await buttons[0].onClick(event);
  assert.equal(calls.some(call => call[0] === 'add'), false);
});
test('quantity controls preserve maximum stock and removal at quantity one', async () => {
  const { buttons, calls, event } = loadActions({ line: { lineId: 'line-1', quantity: 1 }, stock: 1 });
  assert.equal(buttons[1].disabled, true);
  await buttons[1].onClick(event);
  assert.equal(calls.some(call => call[0] === 'quantity'), false);
  await buttons[0].onClick(event);
  assert.deepEqual(calls.at(-1), ['quantity', 'line-1', 0, 'Air fryer']);
});
test('flash-sale overlay mode keeps its existing hover visibility', () => {
  const { tree } = loadActions({ layout: 'overlay' });
  assert.equal(tree.props.style.pointerEvents, 'none');
  assert.match(tree.props.className, /absolute top-2 right-2/);
});
