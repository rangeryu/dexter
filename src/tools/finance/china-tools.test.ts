import { describe, expect, test } from 'bun:test';
import { createChinaFinanceTools } from './china-tools.js';
import type { ChinaMarketService } from './domain/china-market-service.js';

const fakeService = {
  async getSnapshot(symbol: string) {
    return {
      symbol: symbol === '600519' ? '600519.SH' : symbol,
      name: '贵州茅台',
      assetType: 'stock',
      quote: { close: 1600, tradeDate: '2026-05-25' },
      sources: [{ url: 'tushare://daily?ts_code=600519.SH', apiName: 'daily' }],
    };
  },
  async getFinancialIndicators() {
    return {
      records: [{ symbol: '600519.SH', roe: 0.318 }],
      sources: [{ url: 'tushare://fina_indicator?ts_code=600519.SH', apiName: 'fina_indicator' }],
    };
  },
  async getPriceHistory() {
    return {
      bars: [{ symbol: '600519.SH', close: 1600, tradeDate: '2026-05-25' }],
      sources: [{ url: 'tushare://daily?ts_code=600519.SH', apiName: 'daily' }],
    };
  },
  async getDisclosures() {
    return {
      records: [{ symbol: '600519.SH', title: '年度权益分派实施公告', announceDate: '2026-05-20' }],
      sources: [{ url: 'tushare://anns_d?ts_code=600519.SH', apiName: 'anns_d' }],
    };
  },
  async getEtfHoldings() {
    return {
      holdings: [{ symbol: '600519.SH', name: '贵州茅台', stk_mkv_ratio: 4.2 }],
      sources: [{ url: 'tushare://fund_portfolio?ts_code=510300.SH', apiName: 'fund_portfolio' }],
    };
  },
  async screenStocks() {
    return {
      records: [{ symbol: '600519.SH', name: '贵州茅台', peTtm: 25.2 }],
      criteria: { limit: 1 },
      sources: [{ url: 'tushare://daily_basic', apiName: 'daily_basic' }],
    };
  },
  async getTradeCalendar() {
    return {
      records: [{ exchange: 'SH', date: '2026-05-26', isOpen: true }],
      sources: [{ url: 'tushare://trade_cal?exchange=SSE', apiName: 'trade_cal' }],
    };
  },
  async getCorporateActions() {
    return {
      symbol: '600519.SH',
      records: [{ symbol: '600519.SH', announceDate: '2026-05-20', cashDividendTax: 27.6 }],
      sources: [{ url: 'tushare://dividend?ts_code=600519.SH', apiName: 'dividend' }],
    };
  },
} as unknown as ChinaMarketService;

describe('China finance tools', () => {
  test('returns formatted tool JSON with safe source URLs', async () => {
    const tools = createChinaFinanceTools(fakeService);
    const snapshotTool = tools.find((tool) => tool.name === 'get_cn_stock_snapshot');
    expect(snapshotTool).toBeDefined();

    const raw = await snapshotTool!.invoke({ symbol: '600519' });
    const parsed = JSON.parse(String(raw));

    expect(parsed.data).toMatchObject({
      symbol: '600519.SH',
      name: '贵州茅台',
    });
    expect(parsed.sourceUrls).toEqual(['tushare://daily?ts_code=600519.SH']);
  });
});
