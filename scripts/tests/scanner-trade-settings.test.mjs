import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLotUnits, parsePositions, adjustLotUnits, formatLots } from '../../artifacts/ea-app/src/lib/scanner-trade-settings.ts';

test('lot sizing uses exact hundredths, supports manual decimals and rejects out-of-range/inexact values', () => {
  for (const [text, units] of [['0.01',1],['.05',5],['0.10',10],['1',100],['49.99',4999],['50.00',5000]]) assert.equal(parseLotUnits(text),units);
  for (const value of ['', '.', '0', '0.001', '50.01', '100', '-1', '1e-2', 'NaN', 'Infinity', '0,05']) assert.equal(parseLotUnits(value),null,value);
});
test('lot +/- controls advance one exact step and clamp at the preparation limits', () => {
  assert.equal(adjustLotUnits(1,-1),1);assert.equal(adjustLotUnits(5000,1),5000);
  let units=1;for(let n=0;n<9;n++)units=adjustLotUnits(units,1);
  assert.equal(formatLots(units),'0.10');assert.equal(formatLots(adjustLotUnits(units,-1)),'0.09');
});
test('position settings accept only whole counts from one to twenty', () => {
  for(const value of ['1','2','3','5','10','20'])assert.equal(parsePositions(value),Number(value));
  for(const value of ['', '0','21','1.5','1e1','-1','Infinity'])assert.equal(parsePositions(value),null,value);
});
