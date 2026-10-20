import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBroker, validateMt5Preview, brokers } from '../../artifacts/ea-app/src/lib/brokers.ts';
import { previewMt5Connection } from '../../artifacts/ea-app/src/lib/mt5-preview.ts';

test('broker detection recognises common MT5 server names and regional/legacy aliases', () => {
  const cases = {
    'OANDA-Live': 'OANDA', 'AvaTrade-Demo': 'AvaTrade', 'Exness-MT5Real12': 'Exness', ' exness demo ': 'Exness', 'Deriv-Demo': 'Deriv',
    'ICMarketsSC-MT5-2': 'IC Markets', 'Pepperstone-MT5-Live01': 'Pepperstone',
    'XMGlobal-MT5 2': 'XM', 'XMTrading-Real': 'XM', 'TradingPoint-Real': 'XM',
    'HFMarketsSV-LiveServer3': 'HFM', 'HotForex-Live': 'HFM', 'HFM-Demo': 'HFM',
    'FBS-Real-5': 'FBS', 'Tickmill-Live': 'Tickmill', 'ForexTimeFXTM-Live01': 'FXTM',
  };
  for (const [server, name] of Object.entries(cases)) assert.equal(detectBroker(server)?.name, name, server);
});

test('unknown, ambiguous or spoofed server strings use the neutral fallback', () => {
  for (const server of ['', 'UnknownTrading-Live', 'notxm', 'my-exness-copy', 'Exness-fake', 'https://exness.com', '<img src=x>', 'XM-not-a-broker']) {
    assert.equal(detectBroker(server), null, server);
  }
});

test('every registered logo has explicit HTTPS asset and provenance URLs', () => {
  assert.equal(new Set(brokers.map(b => b.id)).size, brokers.length);
  for (const broker of brokers) {
    assert.equal(new URL(broker.logo).protocol, 'https:');
    assert.equal(new URL(broker.source).protocol, 'https:');
  }
});

test('account validation preserves digit strings and rejects floats, signs and exponents', () => {
  for (const login of ['12345', '000123', '12345678901234567890']) assert.equal(validateMt5Preview(login, 'demo', 'Broker-Real'), null);
  for (const login of ['', '0', '000', '-1', '1.5', '1e9', 'Infinity', '1 23']) assert.ok(validateMt5Preview(login, 'demo', 'Broker-Real'));
  assert.ok(validateMt5Preview('123', '', 'Broker-Real'));
  assert.ok(validateMt5Preview('123', 'demo', ''));
});

test('preview supports cancellation without a backend call', async () => {
  const controller = new AbortController();
  const result = previewMt5Connection({ login: '123', server: 'Exness-MT5Real1' }, controller.signal);
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  await assert.rejects(previewMt5Connection({ login: '123', server: 'Unknown' }, controller.signal), { name: 'AbortError' });
});

test('completed preview always returns unverified without calling fetch', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Preview must never contact a broker or API'); };
  try {
    assert.deepEqual(await previewMt5Connection({ login: '123', server: 'Exness-MT5Real1' }, new AbortController().signal), {
      status: 'unverified', reason: 'verification-unavailable',
    });
  } finally { globalThis.fetch = oldFetch; }
});
