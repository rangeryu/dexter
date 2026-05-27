import type { ChinaAssetType, ChinaFinanceProvider, ChinaSymbol, ProviderQueryResult, ProviderSource } from './provider.js';
import { AkshareProvider } from '../providers/akshare/provider.js';
import { FallbackChinaFinanceProvider } from '../providers/fallback-provider.js';
import { TushareProvider } from '../providers/tushare/provider.js';
import { resolveChinaSymbolOrThrow } from '../symbol/china-symbol.js';

interface QuoteBar {
  symbol: string;
  tradeDate: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  previousClose: number | null;
  change: number | null;
  pctChange: number | null;
  volume: number | null;
  amount: number | null;
  sourceUnits: {
    volume: string;
    amount: string;
  };
}

interface ChinaMarketSnapshot {
  symbol: string;
  code: string;
  exchange: string;
  assetType: ChinaAssetType;
  name?: string;
  industry?: string;
  market?: string;
  listDate?: string;
  quote: QuoteBar;
  valuation?: {
    turnoverRate?: number | null;
    pe?: number | null;
    peTtm?: number | null;
    pb?: number | null;
    ps?: number | null;
    psTtm?: number | null;
    dividendYield?: number | null;
    marketCapCny?: number | null;
    floatMarketCapCny?: number | null;
    sourceUnits: {
      marketCap: string;
      ratios: string;
    };
  };
  fund?: Record<string, unknown>;
  sources: ProviderSource[];
}

interface FinancialIndicatorsResult {
  records: Array<Record<string, unknown>>;
  sources: ProviderSource[];
}

interface StatementsResult {
  incomeStatements: Record<string, unknown>[];
  balanceSheets: Record<string, unknown>[];
  cashFlowStatements: Record<string, unknown>[];
  sources: ProviderSource[];
}

interface DisclosuresResult {
  symbol: string;
  records: Array<{
    symbol: string;
    announceDate: string;
    title: string;
    url?: string;
  }>;
  sources: ProviderSource[];
}

interface TradeCalendarResult {
  records: Array<{
    exchange: string;
    date: string;
    isOpen: boolean;
    pretradeDate?: string;
  }>;
  sources: ProviderSource[];
}

interface CorporateActionsResult {
  symbol: string;
  records: Array<Record<string, unknown>>;
  sources: ProviderSource[];
}

interface ScreenCriteria {
  industries?: string[];
  exchanges?: string[];
  peTtmLte?: number;
  peTtmGte?: number;
  pbLte?: number;
  marketCapCnyGte?: number;
  marketCapCnyLte?: number;
  limit?: number;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pctToDecimal(value: unknown): number | null {
  const parsed = num(value);
  if (parsed === null) return null;
  return Number((parsed / 100).toFixed(6));
}

function dateFromTushare(value: unknown): string {
  const text = String(value ?? '');
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  return text;
}

function sortLatest(records: Record<string, unknown>[], field: string): Record<string, unknown>[] {
  return [...records].sort((a, b) => String(b[field] ?? '').localeCompare(String(a[field] ?? '')));
}

function latest(result: ProviderQueryResult, field: string): Record<string, unknown> | undefined {
  return sortLatest(result.records, field)[0];
}

function mapQuote(row: Record<string, unknown>, symbol: ChinaSymbol): QuoteBar {
  return {
    symbol: symbol.symbol,
    tradeDate: dateFromTushare(row.trade_date),
    open: num(row.open),
    high: num(row.high),
    low: num(row.low),
    close: num(row.close),
    previousClose: num(row.pre_close),
    change: num(row.change),
    pctChange: pctToDecimal(row.pct_chg),
    volume: num(row.vol),
    amount: num(row.amount),
    sourceUnits: {
      volume: 'Tushare vol: hands for A-share/fund daily bars',
      amount: 'Tushare amount: thousand CNY',
    },
  };
}

function marketCapWanToCny(value: unknown): number | null {
  const parsed = num(value);
  return parsed === null ? null : parsed * 10_000;
}

function omitNullish<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== null && value !== undefined),
  );
}

function baseSymbolInfo(symbol: ChinaSymbol, basic?: Record<string, unknown>) {
  return {
    symbol: symbol.symbol,
    code: symbol.code,
    exchange: symbol.exchange,
    assetType: symbol.assetType,
    name: basic?.name ? String(basic.name) : undefined,
    industry: basic?.industry ? String(basic.industry) : undefined,
    market: basic?.market ? String(basic.market) : undefined,
    listDate: basic?.list_date ? dateFromTushare(basic.list_date) : undefined,
  };
}

function normalizeExchangeFilter(exchange: string): string {
  const upper = exchange.toUpperCase();
  if (upper === 'SH') return 'SSE';
  if (upper === 'SZ') return 'SZSE';
  if (upper === 'BJ') return 'BSE';
  return upper;
}

export class ChinaMarketService {
  constructor(private readonly provider: ChinaFinanceProvider = new TushareProvider()) {}

  async getSnapshot(inputSymbol: string): Promise<ChinaMarketSnapshot> {
    const symbol = resolveChinaSymbolOrThrow(inputSymbol);

    if (symbol.assetType === 'etf') {
      const [basicResult, dailyResult] = await Promise.all([
        this.provider.getFundBasic([symbol.symbol]),
        this.provider.getFundDailyBars(symbol.symbol),
      ]);
      const basic = basicResult.records[0];
      const daily = latest(dailyResult, 'trade_date');
      if (!daily) throw new Error(`No China ETF daily data found for ${symbol.symbol}`);

      return {
        ...baseSymbolInfo(symbol, basic),
        quote: mapQuote(daily, symbol),
        fund: basic,
        sources: [basicResult.source, dailyResult.source],
      };
    }

    const [basicResult, dailyResult, dailyBasicResult] = await Promise.all([
      this.provider.getStockBasic([symbol.symbol]),
      this.provider.getDailyBars(symbol.symbol),
      this.provider.getDailyBasic(symbol.symbol),
    ]);
    const basic = basicResult.records[0];
    const daily = latest(dailyResult, 'trade_date');
    if (!daily) throw new Error(`No China A-share daily data found for ${symbol.symbol}`);
    const dailyBasic = latest(dailyBasicResult, 'trade_date');

    return {
      ...baseSymbolInfo(symbol, basic),
      quote: mapQuote(daily, symbol),
      valuation: dailyBasic
        ? {
            turnoverRate: pctToDecimal(dailyBasic.turnover_rate),
            pe: num(dailyBasic.pe),
            peTtm: num(dailyBasic.pe_ttm),
            pb: num(dailyBasic.pb),
            ps: num(dailyBasic.ps),
            psTtm: num(dailyBasic.ps_ttm),
            dividendYield: pctToDecimal(dailyBasic.dv_ttm ?? dailyBasic.dv_ratio),
            marketCapCny: marketCapWanToCny(dailyBasic.total_mv),
            floatMarketCapCny: marketCapWanToCny(dailyBasic.circ_mv),
            sourceUnits: {
              marketCap: 'Tushare total_mv/circ_mv: ten-thousand CNY converted to CNY',
              ratios: 'Tushare valuation ratios; turnover/dividend percentages converted to decimals',
            },
          }
        : undefined,
      sources: [basicResult.source, dailyResult.source, dailyBasicResult.source],
    };
  }

  async getPriceHistory(inputSymbol: string, startDate?: string, endDate?: string): Promise<{ symbol: string; bars: QuoteBar[]; sources: ProviderSource[] }> {
    const symbol = resolveChinaSymbolOrThrow(inputSymbol);
    const result = symbol.assetType === 'etf'
      ? await this.provider.getFundDailyBars(symbol.symbol, startDate, endDate)
      : await this.provider.getDailyBars(symbol.symbol, startDate, endDate);

    return {
      symbol: symbol.symbol,
      bars: sortLatest(result.records, 'trade_date').map((row) => mapQuote(row, symbol)),
      sources: [result.source],
    };
  }

  async getFinancialIndicators(inputSymbol: string, limit = 4): Promise<FinancialIndicatorsResult> {
    const symbol = resolveChinaSymbolOrThrow(inputSymbol);
    const result = await this.provider.getFinancialIndicators(symbol.symbol, limit);
    return {
      records: sortLatest(result.records, 'end_date').slice(0, limit).map((row) => omitNullish({
        symbol: symbol.symbol,
        reportDate: dateFromTushare(row.end_date),
        announceDate: dateFromTushare(row.ann_date),
        eps: num(row.eps),
        dilutedEps: num(row.dt_eps),
        bookValuePerShare: num(row.bps),
        operatingCashFlowPerShare: num(row.ocfps),
        roe: pctToDecimal(row.roe),
        roeDiluted: pctToDecimal(row.roe_dt),
        roa: pctToDecimal(row.roa),
        grossMargin: pctToDecimal(row.grossprofit_margin),
        netMargin: pctToDecimal(row.netprofit_margin),
        debtToAssets: pctToDecimal(row.debt_to_assets),
        currentRatio: num(row.current_ratio),
        quickRatio: num(row.quick_ratio),
        revenueGrowth: pctToDecimal(row.or_yoy),
        netProfitGrowth: pctToDecimal(row.netprofit_yoy),
        sourceUnits: {
          percentages: 'Tushare percentage points converted to decimals',
        },
      })),
      sources: [result.source],
    };
  }

  async getFinancialStatements(inputSymbol: string, limit = 4): Promise<StatementsResult> {
    const symbol = resolveChinaSymbolOrThrow(inputSymbol);
    const [income, balance, cashflow] = await Promise.all([
      this.provider.getIncomeStatements(symbol.symbol, limit),
      this.provider.getBalanceSheets(symbol.symbol, limit),
      this.provider.getCashFlowStatements(symbol.symbol, limit),
    ]);
    return {
      incomeStatements: sortLatest(income.records, 'end_date').slice(0, limit),
      balanceSheets: sortLatest(balance.records, 'end_date').slice(0, limit),
      cashFlowStatements: sortLatest(cashflow.records, 'end_date').slice(0, limit),
      sources: [income.source, balance.source, cashflow.source],
    };
  }

  async getDisclosures(inputSymbol: string, options: { startDate?: string; endDate?: string; limit?: number; keywords?: string[] } = {}): Promise<DisclosuresResult> {
    const symbol = resolveChinaSymbolOrThrow(inputSymbol);
    const result = await this.provider.getDisclosures(symbol.symbol, options.startDate, options.endDate, options.limit ?? 20);
    const keywords = options.keywords?.map((word) => word.trim()).filter(Boolean) ?? [];
    const records = result.records
      .filter((row) => keywords.length === 0 || keywords.some((word) => String(row.title ?? '').includes(word)))
      .slice(0, options.limit ?? 20)
      .map((row) => ({
        symbol: symbol.symbol,
        announceDate: dateFromTushare(row.ann_date),
        title: String(row.title ?? ''),
        url: row.url ? String(row.url) : undefined,
      }));

    return { symbol: symbol.symbol, records, sources: [result.source] };
  }

  async getEtfHoldings(inputSymbol: string, limit = 20): Promise<{ symbol: string; holdings: Record<string, unknown>[]; sources: ProviderSource[] }> {
    const symbol = resolveChinaSymbolOrThrow(inputSymbol);
    const result = await this.provider.getFundPortfolio(symbol.symbol);
    return {
      symbol: symbol.symbol,
      holdings: sortLatest(result.records, 'stk_mkv_ratio').slice(0, limit),
      sources: [result.source],
    };
  }

  async getTradeCalendar(exchange?: string, startDate?: string, endDate?: string, isOpen?: boolean): Promise<TradeCalendarResult> {
    const result = await this.provider.getTradeCalendar(exchange, startDate, endDate, isOpen);
    return {
      records: sortLatest(result.records, 'cal_date').map((row) => ({
        exchange: String(row.exchange ?? exchange ?? ''),
        date: dateFromTushare(row.cal_date),
        isOpen: Number(row.is_open) === 1,
        pretradeDate: row.pretrade_date ? dateFromTushare(row.pretrade_date) : undefined,
      })),
      sources: [result.source],
    };
  }

  async getCorporateActions(inputSymbol: string, limit = 10): Promise<CorporateActionsResult> {
    const symbol = resolveChinaSymbolOrThrow(inputSymbol);
    const result = await this.provider.getDividends(symbol.symbol, limit);
    return {
      symbol: symbol.symbol,
      records: sortLatest(result.records, 'ann_date').slice(0, limit).map((row) => omitNullish({
        symbol: symbol.symbol,
        announceDate: dateFromTushare(row.ann_date),
        process: row.div_proc ? String(row.div_proc) : undefined,
        stockDividend: num(row.stk_div),
        bonusShareRatio: num(row.stk_bo_rate),
        transferShareRatio: num(row.stk_co_rate),
        cashDividend: num(row.cash_div),
        cashDividendTax: num(row.cash_div_tax),
        recordDate: row.record_date ? dateFromTushare(row.record_date) : undefined,
        exDate: row.ex_date ? dateFromTushare(row.ex_date) : undefined,
        payDate: row.pay_date ? dateFromTushare(row.pay_date) : undefined,
      })),
      sources: [result.source],
    };
  }

  async screenStocks(criteria: ScreenCriteria): Promise<{ records: Record<string, unknown>[]; sources: ProviderSource[]; criteria: ScreenCriteria }> {
    const [basicResult, dailyBasicResult] = await Promise.all([
      this.provider.getStockBasic(),
      this.provider.getDailyBasic(),
    ]);
    const basicBySymbol = new Map(basicResult.records.map((row) => [String(row.ts_code), row]));
    const industries = new Set(criteria.industries ?? []);
    const exchanges = new Set((criteria.exchanges ?? []).map(normalizeExchangeFilter));

    const records = dailyBasicResult.records
      .map((row) => {
        const symbol = String(row.ts_code);
        const basic = basicBySymbol.get(symbol) ?? {};
        return {
          symbol,
          name: basic.name,
          industry: basic.industry,
          exchange: basic.exchange,
          tradeDate: dateFromTushare(row.trade_date),
          close: num(row.close),
          peTtm: num(row.pe_ttm),
          pb: num(row.pb),
          marketCapCny: marketCapWanToCny(row.total_mv),
        };
      })
      .filter((row) => {
        if (industries.size > 0 && !industries.has(String(row.industry))) return false;
        if (exchanges.size > 0 && !exchanges.has(normalizeExchangeFilter(String(row.exchange)))) return false;
        if (criteria.peTtmLte !== undefined && (row.peTtm === null || row.peTtm > criteria.peTtmLte)) return false;
        if (criteria.peTtmGte !== undefined && (row.peTtm === null || row.peTtm < criteria.peTtmGte)) return false;
        if (criteria.pbLte !== undefined && (row.pb === null || row.pb > criteria.pbLte)) return false;
        if (criteria.marketCapCnyGte !== undefined && (row.marketCapCny === null || row.marketCapCny < criteria.marketCapCnyGte)) return false;
        if (criteria.marketCapCnyLte !== undefined && (row.marketCapCny === null || row.marketCapCny > criteria.marketCapCnyLte)) return false;
        return true;
      })
      .slice(0, criteria.limit ?? 25);

    return { records, sources: [basicResult.source, dailyBasicResult.source], criteria };
  }
}

let defaultService: ChinaMarketService | null = null;

function createDefaultProvider(): ChinaFinanceProvider {
  const tushare = new TushareProvider();
  if (process.env.AKSHARE_FALLBACK === '1' || process.env.AKSHARE_FALLBACK === 'true') {
    return new FallbackChinaFinanceProvider(tushare, new AkshareProvider());
  }
  return tushare;
}

export function getDefaultChinaMarketService(): ChinaMarketService {
  defaultService ??= new ChinaMarketService(createDefaultProvider());
  return defaultService;
}
