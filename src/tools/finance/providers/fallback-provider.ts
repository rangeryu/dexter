import type { ChinaFinanceProvider, ProviderQueryResult } from '../domain/provider.js';

async function withFallback(
  primary: () => Promise<ProviderQueryResult>,
  fallback: () => Promise<ProviderQueryResult>,
): Promise<ProviderQueryResult> {
  try {
    const result = await primary();
    if (result.records.length > 0) return result;
  } catch {
    // Fall through to the fallback provider. Tool-level errors include source details
    // from the provider that ultimately handles the request.
  }
  return fallback();
}

export class FallbackChinaFinanceProvider implements ChinaFinanceProvider {
  constructor(
    private readonly primary: ChinaFinanceProvider,
    private readonly fallback: ChinaFinanceProvider,
  ) {}

  getStockBasic(symbols?: string[]) {
    return withFallback(
      () => this.primary.getStockBasic(symbols),
      () => this.fallback.getStockBasic(symbols),
    );
  }

  getDailyBars(symbol: string, startDate?: string, endDate?: string) {
    return withFallback(
      () => this.primary.getDailyBars(symbol, startDate, endDate),
      () => this.fallback.getDailyBars(symbol, startDate, endDate),
    );
  }

  getFundDailyBars(symbol: string, startDate?: string, endDate?: string) {
    return withFallback(
      () => this.primary.getFundDailyBars(symbol, startDate, endDate),
      () => this.fallback.getFundDailyBars(symbol, startDate, endDate),
    );
  }

  getDailyBasic(symbol?: string, startDate?: string, endDate?: string) {
    return withFallback(
      () => this.primary.getDailyBasic(symbol, startDate, endDate),
      () => this.fallback.getDailyBasic(symbol, startDate, endDate),
    );
  }

  getFinancialIndicators(symbol: string, limit?: number) {
    return withFallback(
      () => this.primary.getFinancialIndicators(symbol, limit),
      () => this.fallback.getFinancialIndicators(symbol, limit),
    );
  }

  getIncomeStatements(symbol: string, limit?: number) {
    return withFallback(
      () => this.primary.getIncomeStatements(symbol, limit),
      () => this.fallback.getIncomeStatements(symbol, limit),
    );
  }

  getBalanceSheets(symbol: string, limit?: number) {
    return withFallback(
      () => this.primary.getBalanceSheets(symbol, limit),
      () => this.fallback.getBalanceSheets(symbol, limit),
    );
  }

  getCashFlowStatements(symbol: string, limit?: number) {
    return withFallback(
      () => this.primary.getCashFlowStatements(symbol, limit),
      () => this.fallback.getCashFlowStatements(symbol, limit),
    );
  }

  getDisclosures(symbol: string, startDate?: string, endDate?: string, limit?: number) {
    return withFallback(
      () => this.primary.getDisclosures(symbol, startDate, endDate, limit),
      () => this.fallback.getDisclosures(symbol, startDate, endDate, limit),
    );
  }

  getFundBasic(symbols?: string[]) {
    return withFallback(
      () => this.primary.getFundBasic(symbols),
      () => this.fallback.getFundBasic(symbols),
    );
  }

  getFundPortfolio(symbol: string, endDate?: string) {
    return withFallback(
      () => this.primary.getFundPortfolio(symbol, endDate),
      () => this.fallback.getFundPortfolio(symbol, endDate),
    );
  }

  getTradeCalendar(exchange?: string, startDate?: string, endDate?: string, isOpen?: boolean) {
    return withFallback(
      () => this.primary.getTradeCalendar(exchange, startDate, endDate, isOpen),
      () => this.fallback.getTradeCalendar(exchange, startDate, endDate, isOpen),
    );
  }

  getDividends(symbol: string, limit?: number) {
    return withFallback(
      () => this.primary.getDividends(symbol, limit),
      () => this.fallback.getDividends(symbol, limit),
    );
  }
}
