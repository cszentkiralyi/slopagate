const Todo = require('../src/tools/todo.js');
const test = require('node:test');

function createTool(nudge = () => {}) {
  return { message: () => {}, harness: { nudge } };
}

function parseItems(viewResult) {
  if (viewResult === '(empty)') return [];
  return viewResult.split('\n');
}

test('todo: edit nudges with the updated compact list', async (t) => {
  const nudges = [];
  const todo = new Todo({ name: 'todo' });
  const content = `- [ ] Buy groceries
- [x] Call dentist`;
  await todo.handler({ mode: 'edit', content }, createTool((msg) => nudges.push(msg)));
  t.assert.equal(nudges.length, 1, 'should have 1 nudge');
  t.assert.ok(nudges[0].includes('Todo list updated:'), 'nudge should start with updated message');
  t.assert.ok(nudges[0].includes('- [ ] Buy groceries'), 'nudge should include unchecked item');
  t.assert.ok(nudges[0].includes('- [x] Call dentist'), 'nudge should include checked item');
});

test('todo: edit with all items checked triggers both nudges', async (t) => {
  const nudges = [];
  const todo = new Todo({ name: 'todo' });
  const content = '- [x] Item one\n- [x] Item two';
  await todo.handler({ mode: 'edit', content }, createTool((msg) => nudges.push(msg)));
  t.assert.equal(nudges.length, 2, 'should have 2 nudges');
  t.assert.ok(nudges[0].includes('Todo list updated:'), 'first nudge is the updated list');
  t.assert.ok(nudges[1].includes('Todo list is fully completed'), 'second nudge is completion message');
});

test('todo: edit with mixed items triggers only updated-list nudge', async (t) => {
  const nudges = [];
  const todo = new Todo({ name: 'todo' });
  const content = '- [x] Done item\n- [ ] Pending item';
  await todo.handler({ mode: 'edit', content }, createTool((msg) => nudges.push(msg)));
  t.assert.equal(nudges.length, 1, 'should have 1 nudge');
  t.assert.ok(nudges[0].includes('Todo list updated:'), 'nudge should be the updated list');
  t.assert.ok(!nudges[0].includes('fully completed'), 'should not include completion nudge');
});

test('todo: parse ignores leading non-item lines', async (t) => {
  const todo = new Todo({ name: 'todo' });
  const content = `# My Todo List
Some preamble text here.

- [ ] First item
- [x] Second item`;
  await todo.handler({ mode: 'edit', content }, createTool());
  const result = await todo.handler({ mode: 'view' }, createTool());
  const items = parseItems(result);
  t.assert.equal(items.length, 2, 'should have 2 items');
  t.assert.equal(items[0], '- [ ] First item');
  t.assert.equal(items[1], '- [x] Second item');
});

test('todo: parse joins continuation lines into one item', async (t) => {
  const todo = new Todo({ name: 'todo' });
  const content = `- [ ] Buy groceries
  with milk and eggs
  and bread too
- [x] Call dentist`;
  await todo.handler({ mode: 'edit', content }, createTool());
  const result = await todo.handler({ mode: 'view' }, createTool());
  const items = parseItems(result);
  t.assert.equal(items.length, 2, 'should have 2 items');
  t.assert.equal(items[0], '- [ ] Buy groceries with milk and eggs and bread too');
  t.assert.equal(items[1], '- [x] Call dentist');
});

test('todo: parse handles empty content', async (t) => {
  const todo = new Todo({ name: 'todo' });
  await todo.handler({ mode: 'edit', content: '' }, createTool());
  const result = await todo.handler({ mode: 'view' }, createTool());
  t.assert.equal(result, '(empty)', 'should be empty');
});

test('todo: parse handles null content', async (t) => {
  const todo = new Todo({ name: 'todo' });
  await todo.handler({ mode: 'edit', content: null }, createTool());
  const result = await todo.handler({ mode: 'view' }, createTool());
  t.assert.equal(result, '(empty)', 'should be empty');
});

test('todo: parse handles content with no items', async (t) => {
  const todo = new Todo({ name: 'todo' });
  const content = 'This is just text with no todo items.';
  await todo.handler({ mode: 'edit', content }, createTool());
  const result = await todo.handler({ mode: 'view' }, createTool());
  t.assert.equal(result, '(empty)', 'should be empty');
});

test('todo: parse accepts both [x] and [X]', async (t) => {
  const todo = new Todo({ name: 'todo' });
  const content = `- [x] Lowercase x
- [X] Uppercase X
- [ ] Active item`;
  await todo.handler({ mode: 'edit', content }, createTool());
  const result = await todo.handler({ mode: 'view' }, createTool());
  const items = parseItems(result);
  t.assert.equal(items.length, 3, 'should have 3 items');
  t.assert.equal(items[0], '- [x] Lowercase x');
  t.assert.equal(items[1], '- [X] Uppercase X');
  t.assert.equal(items[2], '- [ ] Active item');
});

test('todo: view returns concatenated items', async (t) => {
  const todo = new Todo({ name: 'todo' });
  // Use edit to set items, then view to check
  const content = `- [ ] Item one
- [x] Item two
- [ ] Item three`;
  await todo.handler({ mode: 'edit', content }, createTool());
  const result = await todo.handler({ mode: 'view' }, createTool());
  t.assert.equal(result, '- [ ] Item one\n- [x] Item two\n- [ ] Item three');
});

test('todo: view returns (empty) when no items', async (t) => {
  const todo = new Todo({ name: 'todo' });
  const result = await todo.handler({ mode: 'view' }, createTool());
  t.assert.equal(result, '(empty)');
});

test('todo: edit with no content clears list', async (t) => {
  const todo = new Todo({ name: 'todo' });
  await todo.handler({ mode: 'edit', content: '- [ ] Existing item' }, createTool());
  await todo.handler({ mode: 'edit', content: '' }, createTool());
  const result = await todo.handler({ mode: 'view' }, createTool());
  t.assert.equal(result, '(empty)', 'should be cleared');
});

test('todo: parse strips whitespace from continuation lines', async (t) => {
  const todo = new Todo({ name: 'todo' });
  const content = `- [ ] Task with
    heavy
    indentation
    continuation`;
  await todo.handler({ mode: 'edit', content }, createTool());
  const result = await todo.handler({ mode: 'view' }, createTool());
  const items = parseItems(result);
  t.assert.equal(items[0], '- [ ] Task with heavy indentation continuation');
});

test('todo: parse skips blank lines between items', async (t) => {
  const todo = new Todo({ name: 'todo' });
  const content = `- [ ] First

- [x] Second`;
  await todo.handler({ mode: 'edit', content }, createTool());
  const result = await todo.handler({ mode: 'view' }, createTool());
  const items = parseItems(result);
  t.assert.equal(items.length, 2, 'should have 2 items');
  t.assert.equal(items[0], '- [ ] First');
  t.assert.equal(items[1], '- [x] Second');
});
