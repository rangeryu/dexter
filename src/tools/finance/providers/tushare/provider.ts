import type { ChinaFinanceProvider, ProviderQueryResult } from '../../domain/provider.js';
import { TushareClient } from './client.js';

const STOCK_BASIC_FIELDS = ['ts_code', 'symbol', 'name', 'area', 'industry', 'market', 'exchange', 'list_date', 'list_status'];
const FUND_BASIC_FIELDS = ['ts_code', 'name', 'management', 'custodian', 'fund_type', 'found_date', 'list_date', 'm_fee', 'c_fee', 'benchmark', 'status', 'market'];
const DAILY_FIELDS = ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'pre_close', 'change', 'pct_chg', 'vol', 'amount'];
const DAILY_BASIC_FIELDS = ['ts_code', 'trade_date', 'close', 'turnover_rate', 'volume_ratio', 'pe', 'pe_ttm', 'pb', 'ps', 'ps_ttm', 'dv_ratio', 'dv_ttm', 'total_share', 'float_share', 'total_mv', 'circ_mv'];
const FINA_INDICATOR_FIELDS = [
  'ts_code',
  'ann_date',
  'end_date',
  'eps',
  'dt_eps',
  'bps',
  'ocfps',
  'roe',
  'roe_dt',
  'roa',
  'grossprofit_margin',
  'netprofit_margin',
  'debt_to_assets',
  'current_ratio',
  'quick_ratio',
  'or_yoy',
  'netprofit_yoy',
];
const INCOME_FIELDS = ['ts_code', 'ann_date', 'end_date', 'total_revenue', 'revenue', 'operate_profit', 'total_profit', 'n_income', 'n_income_attr_p', 'basic_eps', 'diluted_eps'];
const BALANCE_FIELDS = ['ts_code', 'ann_date', 'end_date', 'total_assets', 'total_liab', 'total_hldr_eqy_exc_min_int', 'money_cap', 'inventories', 'accounts_receiv'];
const CASHFLOW_FIELDS = ['ts_code', 'ann_date', 'end_date', 'net_profit', 'c_fr_sale_sg', 'n_cashflow_act', 'n_cashflow_inv_act', 'n_cash_flows_fnc_act', 'free_cashflow'];
const DISCLOSURE_FIELDS = ['ts_code', 'ann_date', 'title', 'url'];
const FUND_PORTFOLIO_FIELDS = ['ts_code', 'ann_date', 'end_date', 'symbol', 'mkv', 'amount', 'stk_mkv_ratio', 'stk_float_ratio'];
const TRADE_CAL_FIELDS = ['exchange', 'cal_date', 'is_open', 'pretrade_date'];
const DIVIDEND_FIELDS = ['ts_code', 'ann_date', 'div_proc', 'stk_div', 'stk_bo_rate', 'stk_co_rate', 'cash_div', 'cash_div_tax', 'record_date', 'ex_date', 'pay_date'];

function yyyymmdd(date?: string): string | undefined {
  return date?.replaceAll('-', '');
}

function defaultStartDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function today(): string {
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

function filterSymbols(result: ProviderQueryResult, symbols?: string[]): ProviderQueryResult {
  if (!symbols?.length) return result;
  const wanted = new Set(symbols);
  return {
    ...result,
    records: result.records.filter((record) => wanted.has(String(record.ts_code))),
  };
}

export class TushareProvider implements ChinaFinanceProvider {
  constructor(private readonly client = new TushareClient()) {}

  async getStockBasic(symbols?: string[]): Promise<ProviderQueryResult> {
    const result = await this.client.query('stock_basic', {
      params: { list_status: 'L' },
      fields: STOCK_BASIC_FIELDS,
    });
    return filterSymbols(result, symbols);
  }

  async getDailyBars(symbol: string, startDate?: string, endDate?: string): Promise<ProviderQueryResult> {
    return this.client.query('daily', {
      params: {
        ts_code: symbol,
        start_date: yyyymmdd(startDate) ?? defaultStartDate(370),
        end_date: yyyymmdd(endDate) ?? today(),
      },
      fields: DAILY_FIELDS,
    });
  }

  async getFundDailyBars(symbol: string, startDate?: string, endDate?: string): Promise<ProviderQueryResult> {
    return this.client.query('fund_daily', {
      params: {
        ts_code: symbol,
        start_date: yyyymmdd(startDate) ?? defaultStartDate(370),
        end_date: yyyymmdd(endDate) ?? today(),
      },
      fields: DAILY_FIELDS,
    });
  }

  async getDailyBasic(symbol?: string, startDate?: string, endDate?: string): Promise<ProviderQueryResult> {
    return this.client.query('daily_basic', {
      params: {
        ts_code: symbol,
        start_date: yyyymmdd(startDate) ?? defaultStartDate(30),
        end_date: yyyymmdd(endDate) ?? today(),
      },
      fields: DAILY_BASIC_FIELDS,
    });
  }

  async getFinancialIndicators(symbol: string, limit = 4): Promise<ProviderQueryResult> {
    return this.client.query('fina_indicator', {
      params: { ts_code: symbol, limit },
      fields: FINA_INDICATOR_FIELDS,
    });
  }

  async getIncomeStatements(symbol: string, limit = 4): Promise<ProviderQueryResult> {
    return this.client.query('income', {
      params: { ts_code: symbol, limit },
      fields: INCOME_FIELDS,
    });
  }

  async getBalanceSheets(symbol: string, limit = 4): Promise<ProviderQueryResult> {
    return this.client.query('balancesheet', {
      params: { ts_code: symbol, limit },
      fields: BALANCE_FIELDS,
    });
  }

  async getCashFlowStatements(symbol: string, limit = 4): Promise<ProviderQueryResult> {
    return this.client.query('cashflow', {
      params: { ts_code: symbol, limit },
      fields: CASHFLOW_FIELDS,
    });
  }

  async getDisclosures(symbol: string, startDate?: string, endDate?: string, limit = 20): Promise<ProviderQueryResult> {
    const result = await this.client.query('anns_d', {
      params: {
        ts_code: symbol,
        start_date: yyyymmdd(startDate) ?? defaultStartDate(180),
        end_date: yyyymmdd(endDate) ?? today(),
      },
      fields: DISCLOSURE_FIELDS,
    });
    return { ...result, records: result.records.slice(0, limit) };
  }

  async getFundBasic(symbols?: string[]): Promise<ProviderQueryResult> {
    const result = await this.client.query('fund_basic', {
      params: { market: 'E', status: 'L' },
      fields: FUND_BASIC_FIELDS,
    });
    return filterSymbols(result, symbols);
  }

  async getFundPortfolio(symbol: string, endDate?: string): Promise<ProviderQueryResult> {
    return this.client.query('fund_portfolio', {
      params: { ts_code: symbol, end_date: yyyymmdd(endDate) },
      fields: FUND_PORTFOLIO_FIELDS,
    });
  }

  async getTradeCalendar(exchange?: string, startDate?: string, endDate?: string, isOpen?: boolean): Promise<ProviderQueryResult> {
    return this.client.query('trade_cal', {
      params: {
        exchange: exchange ? normalizeCalendarExchange(exchange) : '',
        start_date: yyyymmdd(startDate) ?? defaultStartDate(30),
        end_date: yyyymmdd(endDate) ?? today(),
        is_open: isOpen === undefined ? undefined : isOpen ? 1 : 0,
      },
      fields: TRADE_CAL_FIELDS,
    });
  }

  async getDividends(symbol: string, limit = 10): Promise<ProviderQueryResult> {
    const result = await this.client.query('dividend', {
      params: { ts_code: symbol },
      fields: DIVIDEND_FIELDS,
    });
    return { ...result, records: result.records.slice(0, limit) };
  }
}

function normalizeCalendarExchange(exchange: string): string {
  const upper = exchange.toUpperCase();
  if (upper === 'SH') return 'SSE';
  if (upper === 'SZ') return 'SZSE';
  if (upper === 'BJ') return 'BSE';
  return upper;
}
