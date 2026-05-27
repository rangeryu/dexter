import { describe, expect, test } from 'bun:test';
import {
  detectChinaMarketQuery,
  normalizeChinaSymbol,
  resolveKnownChinaSymbol,
} from './china-symbol.js';

describe('china symbol resolver', () => {
  test('normalizes six digit A-share and ETF codes to exchange-qualified Tushare symbols', () => {
    expect(normalizeChinaSymbol('600519')).toEqual({
      symbol: '600519.SH',
      code: '600519',
      exchange: 'SH',
      market: 'CN',
      assetType: 'stock',
    });
    expect(normalizeChinaSymbol('000001')).toEqual({
      symbol: '000001.SZ',
      code: '000001',
      exchange: 'SZ',
      market: 'CN',
      assetType: 'stock',
    });
    expect(normalizeChinaSymbol('510300')).toEqual({
      symbol: '510300.SH',
      code: '510300',
      exchange: 'SH',
      market: 'CN',
      assetType: 'etf',
    });
  });

  test('preserves explicit SH/SZ/BJ suffixes and detects Beijing exchange', () => {
    expect(normalizeChinaSymbol('688981.SH')?.symbol).toBe('688981.SH');
    expect(normalizeChinaSymbol('301308.sz')?.symbol).toBe('301308.SZ');
    expect(normalizeChinaSymbol('430047.BJ')?.exchange).toBe('BJ');
  });

  test('resolves common Chinese company and ETF names without an LLM call', () => {
    expect(resolveKnownChinaSymbol('贵州茅台最近估值')).toMatchObject({
      symbol: '600519.SH',
      assetType: 'stock',
    });
    expect(resolveKnownChinaSymbol('沪深300ETF走势')).toMatchObject({
      symbol: '510300.SH',
      assetType: 'etf',
    });
  });

  test('detects China-market intent from suffixes, six digit codes, and Chinese market words', () => {
    expect(detectChinaMarketQuery('600519.SH 最近公告')).toBe(true);
    expect(detectChinaMarketQuery('000001 过去一年ROE')).toBe(true);
    expect(detectChinaMarketQuery('A股红利ETF筛选')).toBe(true);
    expect(detectChinaMarketQuery('Compare AAPL and MSFT revenue')).toBe(false);
  });
});
