import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const collection = JSON.parse(
  readFileSync(
    new URL('../postman/BITS-WILP-CC-Sem3-Assign1.postman_collection.json', import.meta.url)
  )
);
const script = collection.event
  .find((event) => event.listen === 'prerequest')
  .script.exec.join('\n');
const now = Date.parse('2026-11-12T18:45:00Z');
class ClockDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [now]));
  }
  static now() {
    return now;
  }
}
function execute(bookingDate, requestName = 'Create reservation') {
  const values = new Map([
    ['bookingDate', bookingDate],
    ['requestKey', 'existing-key']
  ]);
  const pm = {
    collectionVariables: {
      get: (key) => values.get(key),
      set: (key, value) => values.set(key, value)
    },
    info: { requestName },
    variables: { replaceIn: () => 'fresh-key' }
  };
  vm.runInNewContext(script, { pm, Date: ClockDate, Intl: undefined });
  return values;
}
for (const [name, value] of [
  ['empty', ''],
  ['past', '2026-11-12'],
  ['malformed', 'tomorrow'],
  ['invalid calendar', '2026-02-30']
]) {
  test(`Postman refreshes ${name} booking dates without Intl`, () => {
    assert.equal(execute(value).get('bookingDate'), '2026-11-19');
  });
}
test('Postman uses the India calendar date across midnight', () => {
  assert.equal(execute('2026-11-13').get('bookingDate'), '2026-11-13');
});
test('Postman preserves a valid future selection', () => {
  assert.equal(execute('2099-11-18').get('bookingDate'), '2099-11-18');
});
test('Postman creates a fresh request key for a new reservation', () => {
  assert.equal(execute('2026-11-13').get('requestKey'), 'fresh-key');
});
test('Postman reuses the existing key for a replay', () => {
  assert.equal(execute('2026-11-13', 'Replay reservation').get('requestKey'), 'existing-key');
});
