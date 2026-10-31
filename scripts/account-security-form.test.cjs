const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const state = [], calls = [], messages = [];
  let index = 0, logouts = 0;
  const mod = { exports: {} };
  const mocks = {
    react: { useState(initial) {
      const slot = index++;
      if (!(slot in state)) state[slot] = initial;
      return [state[slot], value => { state[slot] = typeof value === 'function' ? value(state[slot]) : value; }];
    } },
    'lucide-react': { Eye: () => null, EyeOff: () => null },
    sonner: { toast: { error: text => messages.push(text), success: text => messages.push(text) } },
    '@/components/ui/icons/account-hub': { AccountHubIcon: () => null },
    '@/components/ui/button': { Button: props => ({ type: 'button', props }) },
    '@/components/ui/input': { Input: props => ({ type: 'input', props }) },
    '@/contexts/AuthProvider': { useAuth: () => ({ logout: async () => { logouts++; } }) },
  };
  const source = ts.transpileModule(fs.readFileSync('src/components/account/sections/AccountSecurityCard.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { module: mod, exports: mod.exports,
    require: key => key in mocks ? mocks[key] : require(key),
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true }; },
  });
  function flatten(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (typeof node.type === 'function') return flatten(node.type(node.props));
    return [node, ...flatten(node.props?.children)];
  }
  const render = () => { index = 0; return flatten(mod.exports.default()); };
  const button = text => render().find(node => node.type === 'button' && node.props.children === text);
  const field = id => render().find(node => node.type === 'input' && node.props.id === id);
  return { render, button, field, calls, messages, logouts: () => logouts };
}
test('account landing page exposes no password input to automatic page-load filling', () => {
  const f = fixture();
  assert.equal(f.render().filter(node => node.type === 'input').length, 0);
  assert.ok(f.button('Change password'));
});
test('opening starts blank, current password requires focus, and cancel discards all password values', () => {
  const f = fixture(); f.button('Change password').props.onClick();
  const current = f.field('current-password');
  assert.equal(current.props.value, ''); assert.equal(current.props.readOnly, true);
  assert.equal(current.props.autoComplete, 'off');
  assert.equal(f.field('new-password').props.autoComplete, 'new-password');
  current.props.onFocus(); assert.equal(f.field('current-password').props.readOnly, false);
  for (const id of ['current-password', 'new-password', 'confirm-password']) {
    f.field(id).props.onChange({ target: { value: 'Example@123' } });
  }
  f.button('Cancel').props.onClick();
  assert.equal(f.render().filter(node => node.type === 'input').length, 0);
  f.button('Change password').props.onClick();
  for (const id of ['current-password', 'new-password', 'confirm-password']) assert.equal(f.field(id).props.value, '');
  assert.equal(f.field('current-password').props.readOnly, true);
  assert.equal(f.calls.length, 0);
});
test('password update still sends the entered current password and logs out after success', async () => {
  const f = fixture(); f.button('Change password').props.onClick();
  f.field('current-password').props.onFocus();
  for (const [id, value] of [['current-password', 'Old@1234'], ['new-password', 'Fresh@1234'], ['confirm-password', 'Fresh@1234']]) {
    f.field(id).props.onChange({ target: { value } });
  }
  assert.equal(f.button('Update password').props.disabled, false);
  const form = f.render().find(node => node.type === 'form');
  form.props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, '/api/medusa/customers/change-password');
  assert.equal(JSON.parse(f.calls[0].options.body).currentPassword, 'Old@1234');
  assert.equal(f.calls[0].options.credentials, 'include');
  assert.equal(f.logouts(), 1);
  assert.equal(f.render().filter(node => node.type === 'input').length, 0);
});
