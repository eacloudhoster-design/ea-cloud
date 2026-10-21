import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatScannerPrice } from '../../artifacts/ea-app/src/lib/scanner-format.ts';

test('report levels preserve decimal precision, localize prices and never turn missing or tiny levels into zero', () => {
  assert.equal(formatScannerPrice(null,'en-US'),'—');
  assert.equal(formatScannerPrice(2654.3,'en-US'),'2,654.30');
  assert.equal(formatScannerPrice(2654.3,'de-DE'),'2.654,30');
  assert.equal(formatScannerPrice(1.08765,'en-US'),'1.08765');
  for(const price of [1e-7,1e-12,1e-30]) assert.equal(Number(formatScannerPrice(price,'en-US')),price);
});
