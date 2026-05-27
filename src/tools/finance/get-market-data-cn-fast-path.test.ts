import { describe, expect, test } from 'bun:test';
import { maybeHandleChinaMarketDataQuery } from './get-market-data.js';
import type { ChinaMarketService } from './domain/china-market-service.js';

const fakeService = {
  async getSnapshot(symbol: string) {
    return {
      symbol: symbol === '600519.SH' ? '600519.SH' : symbol,
      name: '贵州茅台',
      quote: { close: 1273.38, tradeDate: '2026-05-26' },
      sources: [{ url: 'tushare://daily?ts_code=600519.SH', apiName: 'daily' }],
    };
  },
  async getPriceHistory() {
    throw new Error('should not be called for latest quote');
  },
  async getDisclosures() {
    throw new Error('should not be called for latest quote');
  },
  async getEtfHoldings() {
    throw new Error('should not be called for latest quote');
  },
  async getTradeCalendar() {
    throw new Error('should not be called for latest quote');
  },
  async getCorporateActions() {
    throw new Error('should not be called for latest quote');
  },
} as unknown as ChinaMarketService;

describe('China market data fast path', () => {
  test('handles latest A-share quote without requiring an LLM router call', async () => {
    const result = await maybeHandleChinaMarketDataQuery('贵州茅台最新行情', fakeService);

    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.data).toMatchObject({
      get_cn_stock_snapshot_600519_SH: {
        symbol: '600519.SH',
        name: '贵州茅台',
      },
    });
    expect(parsed.sourceUrls).toEqual(['tushare://daily?ts_code=600519.SH']);
  });

  test('returns null for non-China queries so the normal router still handles them', async () => {
    await expect(maybeHandleChinaMarketDataQuery('Apple latest price', fakeService)).resolves.toBeNull();
  });
});
