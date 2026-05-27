import { describe, expect, test } from 'bun:test';
import { ChinaMarketService } from './china-market-service.js';
import type { ChinaFinanceProvider, ProviderQueryResult } from './provider.js';

function result(apiName: string, records: Record<string, unknown>[]): ProviderQueryResult<Record<string, unknown>> {
  return {
    records,
    source: {
      provider: 'fake',
      apiName,
      url: `fake://${apiName}`,
      fetchedAt: '2026-05-26T00:00:00.000Z',
    },
  };
}

function createProvider(): ChinaFinanceProvider {
  return {
    async getStockBasic(symbols = []) {
      return result('stock_basic', symbols.map((tsCode) => ({
        ts_code: tsCode,
        name: tsCode === '600519.SH' ? '贵州茅台' : '沪深300ETF',
        industry: '白酒',
        market: '主板',
        list_date: '20010827',
      })));
    },
    async getDailyBars(symbol, _startDate, _endDate) {
      return result('daily', [{
        ts_code: symbol,
        trade_date: '20260525',
        open: 1580,
        high: 1620,
        low: 1570,
        close: 1600,
        pre_close: 1575,
        change: 25,
        pct_chg: 1.5873,
        vol: 320000,
        amount: 5120000,
      }]);
    },
    async getFundDailyBars(symbol) {
      return result('fund_daily', [{
        ts_code: symbol,
        trade_date: '20260525',
        open: 4.1,
        high: 4.2,
        low: 4.05,
        close: 4.18,
        pre_close: 4.09,
        change: 0.09,
        pct_chg: 2.2005,
        vol: 900000,
        amount: 376200,
      }]);
    },
    async getDailyBasic(symbol) {
      return result('daily_basic', [{
        ts_code: symbol,
        trade_date: '20260525',
        turnover_rate: 0.56,
        pe_ttm: 25.2,
        pb: 8.1,
        total_mv: 201000000,
        circ_mv: 201000000,
      }]);
    },
    async getFinancialIndicators(symbol) {
      return result('fina_indicator', [{
        ts_code: symbol,
        end_date: '20251231',
        ann_date: '20260328',
        eps: 68.4,
        roe: 31.8,
        grossprofit_margin: 91.2,
        netprofit_margin: 52.6,
        debt_to_assets: 18.4,
        or_yoy: 16.2,
        netprofit_yoy: 15.1,
      }]);
    },
    async getIncomeStatements() {
      return result('income', []);
    },
    async getBalanceSheets() {
      return result('balancesheet', []);
    },
    async getCashFlowStatements() {
      return result('cashflow', []);
    },
    async getDisclosures(symbol) {
      return result('anns_d', [{
        ts_code: symbol,
        ann_date: '20260520',
        title: '年度权益分派实施公告',
        url: 'https://example.com/notice.pdf',
      }]);
    },
    async getFundBasic(symbols = []) {
      return result('fund_basic', symbols.map((tsCode) => ({
        ts_code: tsCode,
        name: '沪深300ETF',
        fund_type: '股票型',
        management: '华泰柏瑞基金',
        benchmark: '沪深300指数',
        list_date: '20120528',
      })));
    },
    async getFundPortfolio(symbol) {
      return result('fund_portfolio', [{
        ts_code: symbol,
        symbol: '600519.SH',
        name: '贵州茅台',
        mkv: 120000,
        amount: 10000,
        stk_mkv_ratio: 4.2,
      }]);
    },
    async getTradeCalendar(exchange, startDate, endDate) {
      return result('trade_cal', [{
        exchange,
        cal_date: '20260526',
        is_open: 1,
        pretrade_date: '20260525',
        startDate,
        endDate,
      }]);
    },
    async getDividends(symbol) {
      return result('dividend', [{
        ts_code: symbol,
        ann_date: '20260520',
        div_proc: '实施',
        stk_div: 0,
        cash_div_tax: 27.6,
        record_date: '20260527',
        ex_date: '20260528',
        pay_date: '20260528',
      }]);
    },
  };
}

describe('ChinaMarketService', () => {
  test('builds an A-share snapshot with quote, valuation, company metadata, and provenance', async () => {
    const service = new ChinaMarketService(createProvider());
    const snapshot = await service.getSnapshot('600519');

    expect(snapshot.symbol).toBe('600519.SH');
    expect(snapshot.name).toBe('贵州茅台');
    expect(snapshot.assetType).toBe('stock');
    expect(snapshot.quote.close).toBe(1600);
    expect(snapshot.valuation?.peTtm).toBe(25.2);
    expect(snapshot.valuation?.marketCapCny).toBe(2010000000000);
    expect(snapshot.sources.map((s) => s.apiName)).toEqual(['stock_basic', 'daily', 'daily_basic']);
  });

  test('uses fund_daily and fund metadata for ETF snapshots', async () => {
    const service = new ChinaMarketService(createProvider());
    const snapshot = await service.getSnapshot('510300');

    expect(snapshot.symbol).toBe('510300.SH');
    expect(snapshot.assetType).toBe('etf');
    expect(snapshot.quote.close).toBe(4.18);
    expect(snapshot.name).toBe('沪深300ETF');
    expect(snapshot.sources.map((s) => s.apiName)).toEqual(['fund_basic', 'fund_daily']);
  });

  test('maps China financial indicators to decimal ratios with source units explicit', async () => {
    const service = new ChinaMarketService(createProvider());
    const indicators = await service.getFinancialIndicators('600519', 1);

    expect(indicators.records).toEqual([{
      symbol: '600519.SH',
      reportDate: '2025-12-31',
      announceDate: '2026-03-28',
      eps: 68.4,
      roe: 0.318,
      grossMargin: 0.912,
      netMargin: 0.526,
      debtToAssets: 0.184,
      revenueGrowth: 0.162,
      netProfitGrowth: 0.151,
      sourceUnits: {
        percentages: 'Tushare percentage points converted to decimals',
      },
    }]);
    expect(indicators.sources[0]?.apiName).toBe('fina_indicator');
  });

  test('returns China trade calendar rows with boolean market-open semantics', async () => {
    const service = new ChinaMarketService(createProvider());
    const calendar = await service.getTradeCalendar('SH', '2026-05-26', '2026-05-26');

    expect(calendar.records).toEqual([{
      exchange: 'SH',
      date: '2026-05-26',
      isOpen: true,
      pretradeDate: '2026-05-25',
    }]);
    expect(calendar.sources[0]?.apiName).toBe('trade_cal');
  });

  test('returns China dividend and corporate-action records', async () => {
    const service = new ChinaMarketService(createProvider());
    const actions = await service.getCorporateActions('600519', 1);

    expect(actions.records).toEqual([{
      symbol: '600519.SH',
      announceDate: '2026-05-20',
      process: '实施',
      stockDividend: 0,
      cashDividendTax: 27.6,
      recordDate: '2026-05-27',
      exDate: '2026-05-28',
      payDate: '2026-05-28',
    }]);
    expect(actions.sources[0]?.apiName).toBe('dividend');
  });
});
