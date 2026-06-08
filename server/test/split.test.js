import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateSplit } from '../src/split.js';

test('splits itemized subtotal and proportional tax/tip', () => {
  const members = [
    { userId: 'alice', name: 'Alice' },
    { userId: 'bob', name: 'Bob' },
    { userId: 'yinan', name: 'Yinan' }
  ];
  const result = calculateSplit(
    {
      tax: 5.2,
      tip: 12,
      items: [
        { name: 'Steak', price: 38, quantity: 1, assignedTo: ['alice'] },
        { name: 'Pasta', price: 18, quantity: 1, assignedTo: ['bob'] },
        { name: 'Fries', price: 8, quantity: 1, assignedTo: ['alice', 'bob', 'yinan'] }
      ]
    },
    members
  );

  assert.equal(result.alice.itemSubtotal, 40.67);
  assert.equal(result.bob.itemSubtotal, 20.67);
  assert.equal(result.yinan.itemSubtotal, 2.67);
  assert.equal(result.alice.total, 51.6);
  assert.equal(result.bob.total, 26.22);
  assert.equal(result.yinan.total, 3.38);
});
