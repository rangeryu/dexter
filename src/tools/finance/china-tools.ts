import { DynamicStructuredTool, StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { ChinaMarketService, getDefaultChinaMarketService } from './domain/china-market-service.js';

type ResultWithSources = {
  sources?: Array<{ url?: string }>;
};

function sourceUrls(result: ResultWithSources): string[] {
  return (result.sources ?? [])
    .map((source) => source.url)
    .filter((url): url is string => Boolean(url));
}

const ChinaSymbolInputSchema = z.object({
  symbol: z.string().describe('China A-share or ETF symbol/name, e.g. 600519.SH, 000001.SZ, 510300.SH, 贵州茅台, 沪深300ETF.'),
});

const ChinaPricesInputSchema = ChinaSymbolInputSchema.extend({
  start_date: z.string().optional().describe('Start date in YYYY-MM-DD format. Optional; defaults to recent history.'),
  end_date: z.string().optional().describe('End date in YYYY-MM-DD format. Optional; defaults to today.'),
});

const ChinaFinancialIndicatorsInputSchema = ChinaSymbolInputSchema.extend({
  limit: z.number().int().min(1).max(20).default(4).describe('Number of recent reporting periods to return.'),
});

const ChinaDisclosuresInputSchema = ChinaSymbolInputSchema.extend({
  start_date: z.string().optional().describe('Start date in YYYY-MM-DD format. Defaults to recent 180 days.'),
  end_date: z.string().optional().describe('End date in YYYY-MM-DD format. Defaults to today.'),
  limit: z.number().int().min(1).max(50).default(20),
  keywords: z.array(z.string()).optional().describe('Optional Chinese title keywords such as 年报, 回购, 减持, 问询, 分红.'),
});

const ChinaEtfHoldingsInputSchema = ChinaSymbolInputSchema.extend({
  limit: z.number().int().min(1).max(100).default(20),
});

const ChinaTradeCalendarInputSchema = z.object({
  exchange: z.enum(['SSE', 'SZSE', 'BSE', 'SH', 'SZ', 'BJ']).optional().describe('China exchange code. SH/SSE for Shanghai, SZ/SZSE for Shenzhen, BJ/BSE for Beijing.'),
  start_date: z.string().optional().describe('Start date in YYYY-MM-DD format.'),
  end_date: z.string().optional().describe('End date in YYYY-MM-DD format.'),
  is_open: z.boolean().optional().describe('Filter to open trading days or closed days.'),
});

const ChinaCorporateActionsInputSchema = ChinaSymbolInputSchema.extend({
  limit: z.number().int().min(1).max(50).default(10),
});

const ChinaScreenInputSchema = z.object({
  industries: z.array(z.string()).optional().describe('Optional exact China industry names from Tushare stock_basic, e.g. 白酒, 银行.'),
  exchanges: z.array(z.enum(['SSE', 'SZSE', 'BSE', 'SH', 'SZ', 'BJ'])).optional(),
  pe_ttm_lte: z.number().optional().describe('Maximum trailing P/E ratio.'),
  pe_ttm_gte: z.number().optional().describe('Minimum trailing P/E ratio.'),
  pb_lte: z.number().optional().describe('Maximum P/B ratio.'),
  market_cap_cny_gte: z.number().optional().describe('Minimum market cap in CNY.'),
  market_cap_cny_lte: z.number().optional().describe('Maximum market cap in CNY.'),
  limit: z.number().int().min(1).max(100).default(25),
});

export function createChinaFinanceTools(service: ChinaMarketService = getDefaultChinaMarketService()): StructuredToolInterface[] {
  const getChinaStockSnapshot = new DynamicStructuredTool({
    name: 'get_cn_stock_snapshot',
    description: 'Fetches the latest China A-share or exchange-traded ETF quote snapshot, company/fund metadata, and valuation fields from Tushare with optional AkShare fallback.',
    schema: ChinaSymbolInputSchema,
    func: async (input) => {
      const result = await service.getSnapshot(input.symbol);
      return formatToolResult(result, sourceUrls(result));
    },
  });

  const getChinaStockPrices = new DynamicStructuredTool({
    name: 'get_cn_stock_prices',
    description: 'Fetches historical daily OHLCV bars for China A-shares or exchange-traded ETFs. Supports 600519.SH, 000001.SZ, 510300.SH, and common Chinese names.',
    schema: ChinaPricesInputSchema,
    func: async (input) => {
      const result = await service.getPriceHistory(input.symbol, input.start_date, input.end_date);
      return formatToolResult(result, sourceUrls(result));
    },
  });

  const getChinaFinancialIndicators = new DynamicStructuredTool({
    name: 'get_cn_financial_indicators',
    description: 'Fetches China A-share financial indicators such as EPS, ROE, margins, leverage, and growth. Tushare percentage fields are converted to decimals.',
    schema: ChinaFinancialIndicatorsInputSchema,
    func: async (input) => {
      const result = await service.getFinancialIndicators(input.symbol, input.limit);
      return formatToolResult(result, sourceUrls(result));
    },
  });

  const getChinaFinancialStatements = new DynamicStructuredTool({
    name: 'get_cn_financial_statements',
    description: 'Fetches China A-share income statement, balance sheet, and cash flow statement rows using Chinese disclosure periods.',
    schema: ChinaFinancialIndicatorsInputSchema,
    func: async (input) => {
      const result = await service.getFinancialStatements(input.symbol, input.limit);
      return formatToolResult(result, sourceUrls(result));
    },
  });

  const getChinaDisclosures = new DynamicStructuredTool({
    name: 'get_cn_disclosures',
    description: 'Fetches China listed-company announcements/disclosures, the China-market counterpart to SEC filings. Supports keyword filtering for 年报, 季报, 问询, 回购, 减持, 分红, 重组.',
    schema: ChinaDisclosuresInputSchema,
    func: async (input) => {
      const result = await service.getDisclosures(input.symbol, {
        startDate: input.start_date,
        endDate: input.end_date,
        limit: input.limit,
        keywords: input.keywords,
      });
      return formatToolResult(result, sourceUrls(result));
    },
  });

  const getChinaEtfHoldings = new DynamicStructuredTool({
    name: 'get_cn_etf_holdings',
    description: 'Fetches China ETF portfolio holdings and weights where available from Tushare fund_portfolio.',
    schema: ChinaEtfHoldingsInputSchema,
    func: async (input) => {
      const result = await service.getEtfHoldings(input.symbol, input.limit);
      return formatToolResult(result, sourceUrls(result));
    },
  });

  const getChinaTradeCalendar = new DynamicStructuredTool({
    name: 'get_cn_trade_calendar',
    description: 'Fetches China exchange trading calendar rows, including open/closed days and previous trading day.',
    schema: ChinaTradeCalendarInputSchema,
    func: async (input) => {
      const result = await service.getTradeCalendar(input.exchange, input.start_date, input.end_date, input.is_open);
      return formatToolResult(result, sourceUrls(result));
    },
  });

  const getChinaCorporateActions = new DynamicStructuredTool({
    name: 'get_cn_corporate_actions',
    description: 'Fetches China A-share dividend and corporate-action records such as cash dividend, stock dividend, record date, ex-date, and pay date.',
    schema: ChinaCorporateActionsInputSchema,
    func: async (input) => {
      const result = await service.getCorporateActions(input.symbol, input.limit);
      return formatToolResult(result, sourceUrls(result));
    },
  });

  const screenChinaStocks = new DynamicStructuredTool({
    name: 'screen_cn_stocks',
    description: 'Screens China A-shares by valuation and market-cap criteria using Tushare stock_basic and daily_basic fields.',
    schema: ChinaScreenInputSchema,
    func: async (input) => {
      const result = await service.screenStocks({
        industries: input.industries,
        exchanges: input.exchanges,
        peTtmLte: input.pe_ttm_lte,
        peTtmGte: input.pe_ttm_gte,
        pbLte: input.pb_lte,
        marketCapCnyGte: input.market_cap_cny_gte,
        marketCapCnyLte: input.market_cap_cny_lte,
        limit: input.limit,
      });
      return formatToolResult(result, sourceUrls(result));
    },
  });

  return [
    getChinaStockSnapshot,
    getChinaStockPrices,
    getChinaFinancialIndicators,
    getChinaFinancialStatements,
    getChinaDisclosures,
    getChinaEtfHoldings,
    getChinaTradeCalendar,
    getChinaCorporateActions,
    screenChinaStocks,
  ];
}

export const CHINA_FINANCE_TOOL_NAMES = {
  snapshot: 'get_cn_stock_snapshot',
  prices: 'get_cn_stock_prices',
  indicators: 'get_cn_financial_indicators',
  statements: 'get_cn_financial_statements',
  disclosures: 'get_cn_disclosures',
  etfHoldings: 'get_cn_etf_holdings',
  tradeCalendar: 'get_cn_trade_calendar',
  corporateActions: 'get_cn_corporate_actions',
  screener: 'screen_cn_stocks',
} as const;
