export type ChinaExchange = 'SH' | 'SZ' | 'BJ';
export type ChinaAssetType = 'stock' | 'etf';

export interface ChinaSymbol {
  symbol: string;
  code: string;
  exchange: ChinaExchange;
  market: 'CN';
  assetType: ChinaAssetType;
}

export interface ProviderSource {
  provider: string;
  apiName: string;
  url: string;
  fetchedAt: string;
}

export interface ProviderQueryResult<T extends Record<string, unknown> = Record<string, unknown>> {
  records: T[];
  source: ProviderSource;
}

export interface ChinaFinanceProvider {
  getStockBasic(symbols?: string[]): Promise<ProviderQueryResult>;
  getDailyBars(symbol: string, startDate?: string, endDate?: string): Promise<ProviderQueryResult>;
  getFundDailyBars(symbol: string, startDate?: string, endDate?: string): Promise<ProviderQueryResult>;
  getDailyBasic(symbol?: string, startDate?: string, endDate?: string): Promise<ProviderQueryResult>;
  getFinancialIndicators(symbol: string, limit?: number): Promise<ProviderQueryResult>;
  getIncomeStatements(symbol: string, limit?: number): Promise<ProviderQueryResult>;
  getBalanceSheets(symbol: string, limit?: number): Promise<ProviderQueryResult>;
  getCashFlowStatements(symbol: string, limit?: number): Promise<ProviderQueryResult>;
  getDisclosures(symbol: string, startDate?: string, endDate?: string, limit?: number): Promise<ProviderQueryResult>;
  getFundBasic(symbols?: string[]): Promise<ProviderQueryResult>;
  getFundPortfolio(symbol: string, endDate?: string): Promise<ProviderQueryResult>;
  getTradeCalendar(exchange?: string, startDate?: string, endDate?: string, isOpen?: boolean): Promise<ProviderQueryResult>;
  getDividends(symbol: string, limit?: number): Promise<ProviderQueryResult>;
}
