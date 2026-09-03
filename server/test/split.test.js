import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateSplit, reconcileReceiptTotals } from '../src/split.js';

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

test('distributes a receipt service charge stored in tip proportionally', () => {
  const members = [
    { userId: 'alice', name: 'Alice' },
    { userId: 'yinan', name: 'Yinan' }
  ];
  const result = calculateSplit(
    {
      tax: 3.94,
      tip: 7.91,
      items: [
        { name: 'LATTE SMALL', price: 4.25, quantity: 1, assignedTo: ['alice'] },
        { name: 'MIMOSA', price: 7.5, quantity: 1, assignedTo: ['alice'] },
        { name: 'SMALL JUICE', price: 3, quantity: 1, assignedTo: ['alice'] },
        { name: 'THE BOULDER SCRAMBLE', price: 11.75, quantity: 1, assignedTo: ['yinan'] },
        { name: 'SAUSAGE SIDE', price: 3.75, quantity: 1, assignedTo: ['yinan'] },
        { name: 'DOUBLE PANCAKES', price: 9.29, quantity: 1, assignedTo: ['yinan'] }
      ]
    },
    members
  );

  assert.equal(result.alice.total, 19.17);
  assert.equal(result.yinan.total, 32.22);
  assert.equal(result.alice.total + result.yinan.total, 51.39);
});

test('reconciles receipt totals from items and combines the service charge with tip', () => {
  const totals = reconcileReceiptTotals(
    [
      { price: 4.25, quantity: 1 },
      { price: 7.5, quantity: 1 },
      { price: 3, quantity: 1 },
      { price: 11.75, quantity: 1 },
      { price: 3.75, quantity: 1 },
      { price: 9.29, quantity: 1 }
    ],
    { tax: 3.94, tip: 0, serviceCharge: 7.91 }
  );

  assert.deepEqual(totals, { subtotal: 39.54, tax: 3.94, tip: 7.91, total: 51.39 });
  assert.equal(totals.total, totals.subtotal + totals.tax + totals.tip);
});
