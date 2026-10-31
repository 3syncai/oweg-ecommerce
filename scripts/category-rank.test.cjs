const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const moduleValue = { exports: {} };
const source = ts.transpileModule(fs.readFileSync('src/lib/category-rank.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(source, { module: moduleValue, exports: moduleValue.exports });
const { sortCategoriesByRank } = moduleValue.exports;

test('admin ranks order roots and nested categories without changing the input', () => {
  const input = [
    { id: 'later', rank: 2 },
    { id: 'first', rank: 0, category_children: [{ id: 'child-later', rank: 8 }, { id: 'child-first', rank: 1 }] },
    { id: 'middle', rank: 1 },
  ];
  const before = JSON.stringify(input);
  const result = sortCategoriesByRank(input);
  assert.equal(JSON.stringify(result.map(c => c.id)), JSON.stringify(['first', 'middle', 'later']));
  assert.equal(JSON.stringify(result[0].category_children.map(c => c.id)), JSON.stringify(['child-first', 'child-later']));
  assert.equal(JSON.stringify(input), before);
});

test('equal ranks remain stable and unranked categories follow every numeric rank', () => {
  const input = [
    { id: 'missing' }, { id: 'high', rank: 10000 },
    { id: 'tie-a', rank: 1 }, { id: 'invalid', rank: NaN },
    { id: 'tie-b', rank: 1 }, { id: 'null', rank: null },
  ];
  assert.equal(JSON.stringify(sortCategoriesByRank(input).map(c => c.id)),
    JSON.stringify(['tie-a', 'tie-b', 'high', 'missing', 'invalid', 'null']));
});
