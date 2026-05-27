import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { TushareClient, TushareError } from './client.js';

const originalFetch = globalThis.fetch;
const originalToken = process.env.TUSHARE_API_TOKEN;

describe('TushareClient', () => {
  beforeEach(() => {
    process.env.TUSHARE_API_TOKEN = 'test-token';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.TUSHARE_API_TOKEN;
    } else {
      process.env.TUSHARE_API_TOKEN = originalToken;
    }
  });

  test('posts api_name, token, params, and fields and maps fields/items into records', async () => {
    const requests: unknown[] = [];
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({
        code: 0,
        msg: null,
        data: {
          fields: ['ts_code', 'trade_date', 'close'],
          items: [['600519.SH', '20260525', 1600.5]],
        },
      }));
    }) as unknown as typeof fetch;

    const client = new TushareClient();
    const result = await client.query('daily', {
      params: { ts_code: '600519.SH', start_date: '20260501' },
      fields: ['ts_code', 'trade_date', 'close'],
    });

    expect(requests).toEqual([{
      api_name: 'daily',
      token: 'test-token',
      params: { ts_code: '600519.SH', start_date: '20260501' },
      fields: 'ts_code,trade_date,close',
    }]);
    expect(result.records).toEqual([{
      ts_code: '600519.SH',
      trade_date: '20260525',
      close: 1600.5,
    }]);
    expect(result.source.url).toBe('tushare://daily?ts_code=600519.SH&start_date=20260501&fields=ts_code%2Ctrade_date%2Cclose');
    expect(result.source.url).not.toContain('test-token');
  });

  test('throws a typed error when Tushare returns a non-zero code', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({
        code: 2002,
        msg: 'no permission',
        data: { fields: [], items: [] },
      }))) as unknown as typeof fetch;

    const client = new TushareClient();
    await expect(client.query('daily', { params: {}, fields: [] })).rejects.toThrow(TushareError);
  });
});
