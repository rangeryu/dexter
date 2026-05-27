import { DynamicStructuredTool, StructuredToolInterface } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AIMessage, ToolCall } from '@langchain/core/messages';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { formatToolResult } from '../types.js';
import { getCurrentDate } from '../../agent/prompts.js';
import { withTimeout, SUB_TOOL_TIMEOUT_MS } from './utils.js';
import { MARKET_DATA_FORMATTERS } from './formatters.js';
import { ChinaMarketService, getDefaultChinaMarketService } from './domain/china-market-service.js';
import { detectChinaMarketQuery, extractChinaSymbols } from './symbol/china-symbol.js';

/**
 * Rich description for the get_market_data tool.
 * Used in the system prompt to guide the LLM on when and how to use this tool.
 */
export const GET_MARKET_DATA_DESCRIPTION = `
Intelligent meta-tool for retrieving market data including prices, news, and insider activity. Takes a natural language query and automatically routes to appropriate market data sources.

## When to Use

- Current stock price snapshots (price, market cap, volume, 52-week high/low)
- Historical stock prices over date ranges
- Available stock ticker lookup
- Current cryptocurrency price snapshots
- Historical cryptocurrency prices over date ranges
- Available crypto ticker lookup
- Multi-asset price comparisons
- Company news and recent headlines
- Broad market news (macro, rates, earnings, geopolitics)
- Insider trading activity
- Institutional holdings (SEC 13F — who holds a security, what a filer holds)
- China A-share and ETF quotes, history, announcements, and ETF holdings
- China trading calendars and A-share dividend/corporate-action events
- Price move explanations ("why did X go up/down" → combines price + news)

## When NOT to Use

- Company financials like income statements, balance sheets, cash flow (use get_financials)
- Financial metrics and key ratios (use get_financials)
- SEC filings (use read_filings)
- Stock screening by criteria (use stock_screener)
- General web searches (use web_search)

## Usage Notes

- Call ONCE with the complete natural language query - the tool handles complexity internally
- Handles ticker resolution automatically (Apple -> AAPL, Bitcoin -> BTC, 贵州茅台 -> 600519.SH)
- Handles date inference (e.g., "last month", "past year", "YTD")
- For "what ticker is X?" queries, this tool can look up available tickers
- Returns structured JSON data with source URLs for verification
`.trim();

/** Format snake_case tool name to Title Case for progress messages */
function formatSubToolName(name: string): string {
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Import market data tools directly (avoid circular deps with index.ts)
import { getStockPrice, getStockPrices, getStockTickers } from './stock-price.js';
import { getCryptoPriceSnapshot, getCryptoPrices, getCryptoTickers } from './crypto.js';
import { getCompanyNews } from './news.js';
import { getInsiderTrades } from './insider_trades.js';
import { getInstitutionalHoldings } from './institutional_holdings.js';
import { CHINA_FINANCE_TOOL_NAMES, createChinaFinanceTools } from './china-tools.js';

const CHINA_MARKET_DATA_TOOL_NAMES = new Set<string>([
  CHINA_FINANCE_TOOL_NAMES.snapshot,
  CHINA_FINANCE_TOOL_NAMES.prices,
  CHINA_FINANCE_TOOL_NAMES.disclosures,
  CHINA_FINANCE_TOOL_NAMES.etfHoldings,
  CHINA_FINANCE_TOOL_NAMES.tradeCalendar,
  CHINA_FINANCE_TOOL_NAMES.corporateActions,
]);

const CHINA_MARKET_DATA_TOOLS = createChinaFinanceTools().filter((tool) =>
  CHINA_MARKET_DATA_TOOL_NAMES.has(tool.name)
);

// All market data tools available for routing
const MARKET_DATA_TOOLS: StructuredToolInterface[] = [
  // Stock Prices
  getStockPrice,
  getStockPrices,
  getStockTickers,
  // Crypto Prices
  getCryptoPriceSnapshot,
  getCryptoPrices,
  getCryptoTickers,
  // News & Activity
  getCompanyNews,
  getInsiderTrades,
  getInstitutionalHoldings,
  // China A-share / ETF data
  ...CHINA_MARKET_DATA_TOOLS,
];

// Create a map for quick tool lookup by name
const MARKET_DATA_TOOL_MAP = new Map(MARKET_DATA_TOOLS.map(t => [t.name, t]));

// Build the router system prompt for market data
function buildRouterPrompt(): string {
  return `You are a market data routing assistant.
Current date: ${getCurrentDate()}

Given a user's natural language query about market data, call the appropriate tool(s).

## Guidelines

1. **Ticker Resolution**: Convert company/crypto names to ticker symbols:
   - Apple → AAPL, Tesla → TSLA, Microsoft → MSFT, Amazon → AMZN
   - Google/Alphabet → GOOGL, Meta/Facebook → META, Nvidia → NVDA
   - Bitcoin → BTC, Ethereum → ETH, Solana → SOL
   - China A-shares/ETFs: 贵州茅台 → 600519.SH, 宁德时代 → 300750.SZ, 平安银行 → 000001.SZ, 沪深300ETF → 510300.SH

2. **Date Inference**: Use schema-supported filters for date ranges:
   - "last month" → start_date 1 month ago, end_date today
   - "past year" → start_date 1 year ago, end_date today
   - "YTD" → start_date Jan 1 of current year, end_date today
   - "2024" → start_date 2024-01-01, end_date 2024-12-31

3. **Tool Selection**:
   - For a current stock quote/snapshot (price, market cap, volume) → get_stock_price
   - For historical stock prices over a date range → get_stock_prices
   - For "what stocks are available" or ticker lookup → get_stock_tickers
   - For a current crypto price/snapshot → get_crypto_price_snapshot
   - For historical crypto prices over a date range → get_crypto_prices
   - For "what cryptos are available" or crypto ticker lookup → get_crypto_tickers
   - For company-specific news, catalysts, recent announcements → get_company_news with ticker
   - For broad market news (macro, rates, earnings, geopolitics) → get_company_news without ticker
   - For insider buying/selling activity → get_insider_trades
   - For who holds a stock (largest holders, 13F holders of X) → get_institutional_holdings with ticker
   - For a specific manager's portfolio (Citadel, Berkshire, BlackRock, etc.) → get_institutional_holdings with filer_name (the tool resolves name → CIK internally; do NOT make a separate lookup call)
   - For "why did X go up/down" → combine get_stock_price + get_company_news
   - For "what's happening in the markets" → get_company_news without ticker
   - For China A-share/ETF snapshots or historical prices → get_cn_stock_snapshot / get_cn_stock_prices
   - For China listed-company announcements, 年报/季报/回购/减持/问询/分红 → get_cn_disclosures
   - For China ETF constituents and weights → get_cn_etf_holdings
   - For China exchange trading days/holidays/T+1 market-calendar questions → get_cn_trade_calendar
   - For China dividends, ex-dividend dates, record dates, and stock dividends → get_cn_corporate_actions

4. **Efficiency**:
   - For current/latest price, use snapshot tools (not historical with limit 1)
   - For comparisons between assets, call the same tool for each ticker
   - Use the smallest date range that answers the question

Call the appropriate tool(s) now.`;
}

// Input schema for the get_market_data tool
const GetMarketDataInputSchema = z.object({
  query: z.string().describe('Natural language query about market data, prices, news, or insider activity'),
});

function urlsFromSources(result: { sources?: Array<{ url?: string }> }): string[] {
  return (result.sources ?? [])
    .map((source) => source.url)
    .filter((url): url is string => Boolean(url));
}

function keyFor(toolName: string, symbol?: string): string {
  return symbol ? `${toolName}_${symbol.replaceAll('.', '_')}` : toolName;
}

function inferRecentWindow(query: string): { startDate?: string; limit?: number } {
  const months = query.includes('三个月') || query.includes('近3月') || query.includes('最近3月')
    ? 3
    : query.includes('半年') || query.includes('六个月')
      ? 6
      : query.includes('一年') || query.includes('近1年') || query.includes('最近1年')
        ? 12
        : query.includes('一个月') || query.includes('近1月') || query.includes('最近1月')
          ? 1
          : 6;
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return {
    startDate: date.toISOString().slice(0, 10),
    limit: months >= 12 ? 50 : months >= 6 ? 40 : months >= 3 ? 30 : 20,
  };
}

function isHistoryQuery(query: string): boolean {
  return ['历史', '走势', '过去', '近一', '近1', '近3', '三个月', '半年', '一年', 'YTD', 'ytd'].some((word) => query.includes(word));
}

function isDisclosureQuery(query: string): boolean {
  return ['公告', '年报', '季报', '问询', '回购', '减持', '增持', '分红', '重组', '并购', '定增'].some((word) => query.includes(word));
}

function isEtfHoldingsQuery(query: string): boolean {
  return ['ETF持仓', 'ETF成分', '成分股', '权重', '持仓'].some((word) => query.includes(word));
}

function isCalendarQuery(query: string): boolean {
  return ['交易日', '休市', '开市', '节假日', '交易日历'].some((word) => query.includes(word));
}

function isCorporateActionQuery(query: string): boolean {
  return ['除权', '除息', '股权登记', '派息', '送转', '现金分红'].some((word) => query.includes(word));
}

function inferDisclosureKeywords(query: string): string[] {
  const known = ['年报', '半年报', '季报', '一季报', '三季报', '问询', '回购', '减持', '增持', '分红', '权益分派', '重组', '并购', '定增'];
  return known.filter((word) => query.includes(word));
}

export async function maybeHandleChinaMarketDataQuery(
  query: string,
  service: ChinaMarketService = getDefaultChinaMarketService(),
): Promise<string | null> {
  if (!detectChinaMarketQuery(query)) return null;

  const symbols = extractChinaSymbols(query);
  const symbol = symbols[0];

  if (isCalendarQuery(query)) {
    const result = await service.getTradeCalendar(undefined, inferRecentWindow(query).startDate);
    return formatToolResult({ [CHINA_FINANCE_TOOL_NAMES.tradeCalendar]: result }, urlsFromSources(result));
  }

  if (!symbol) {
    return formatToolResult({
      error: 'China market query detected, but no A-share/ETF symbol was resolved. Use a code like 600519.SH or a common Chinese name like 贵州茅台.',
    }, []);
  }

  if (isCorporateActionQuery(query)) {
    const result = await service.getCorporateActions(symbol.symbol, inferRecentWindow(query).limit);
    return formatToolResult({ [keyFor(CHINA_FINANCE_TOOL_NAMES.corporateActions, symbol.symbol)]: result }, urlsFromSources(result));
  }

  if (isDisclosureQuery(query)) {
    const window = inferRecentWindow(query);
    const result = await service.getDisclosures(symbol.symbol, {
      startDate: window.startDate,
      limit: window.limit,
      keywords: inferDisclosureKeywords(query),
    });
    return formatToolResult({ [keyFor(CHINA_FINANCE_TOOL_NAMES.disclosures, symbol.symbol)]: result }, urlsFromSources(result));
  }

  if (isEtfHoldingsQuery(query)) {
    const result = await service.getEtfHoldings(symbol.symbol);
    return formatToolResult({ [keyFor(CHINA_FINANCE_TOOL_NAMES.etfHoldings, symbol.symbol)]: result }, urlsFromSources(result));
  }

  if (isHistoryQuery(query) && !query.includes('最新')) {
    const result = await service.getPriceHistory(symbol.symbol, inferRecentWindow(query).startDate);
    return formatToolResult({ [keyFor(CHINA_FINANCE_TOOL_NAMES.prices, symbol.symbol)]: result }, urlsFromSources(result));
  }

  const result = await service.getSnapshot(symbol.symbol);
  return formatToolResult({ [keyFor(CHINA_FINANCE_TOOL_NAMES.snapshot, symbol.symbol)]: result }, urlsFromSources(result));
}

/**
 * Create a get_market_data tool configured with the specified model.
 * Uses native LLM tool calling for routing queries to market data tools.
 */
export function createGetMarketData(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_market_data',
    description: `Intelligent meta-tool for retrieving market data including prices, news, and insider activity. Takes a natural language query and automatically routes to appropriate market data tools. Use for:
- Current and historical stock prices
- Current and historical cryptocurrency prices
- Stock and crypto ticker lookup
- Company news and recent headlines
- Broad market news (omit ticker)
- Insider trading activity
- Institutional holdings (SEC 13F)
- China A-share / ETF snapshots, historical prices, announcements, ETF holdings, trading calendar, and corporate actions`,
    schema: GetMarketDataInputSchema,
    func: async (input, _runManager, config?: RunnableConfig) => {
      const onProgress = config?.metadata?.onProgress as ((msg: string) => void) | undefined;

      const chinaFastPathResult = await maybeHandleChinaMarketDataQuery(input.query);
      if (chinaFastPathResult) {
        onProgress?.('Fetching China market data...');
        return chinaFastPathResult;
      }

      // 1. Call LLM with market data tools bound (native tool calling)
      onProgress?.('Fetching market data...');
      const { response } = await callLlm(input.query, {
        model,
        systemPrompt: buildRouterPrompt(),
        tools: MARKET_DATA_TOOLS,
      });
      const aiMessage = response as AIMessage;

      // 2. Check for tool calls
      const toolCalls = aiMessage.tool_calls as ToolCall[];
      if (!toolCalls || toolCalls.length === 0) {
        return formatToolResult({ error: 'No tools selected for query' }, []);
      }

      // 3. Execute tool calls in parallel
      const toolNames = [...new Set(toolCalls.map(tc => formatSubToolName(tc.name)))];
      onProgress?.(`Fetching from ${toolNames.join(', ')}...`);
      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          try {
            const tool = MARKET_DATA_TOOL_MAP.get(tc.name);
            if (!tool) {
              throw new Error(`Tool '${tc.name}' not found`);
            }
            const rawResult = await withTimeout(tool.invoke(tc.args), SUB_TOOL_TIMEOUT_MS, tc.name);
            const result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
            const parsed = JSON.parse(result);
            return {
              tool: tc.name,
              args: tc.args,
              data: parsed.data,
              sourceUrls: parsed.sourceUrls || [],
              error: null,
            };
          } catch (error) {
            return {
              tool: tc.name,
              args: tc.args,
              data: null,
              sourceUrls: [],
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );

      // 4. Combine results
      const successfulResults = results.filter((r) => r.error === null);
      const failedResults = results.filter((r) => r.error !== null);

      // Collect all source URLs
      const allUrls = results.flatMap((r) => r.sourceUrls);

      // Build combined data structure
      const combinedData: Record<string, unknown> = {};

      for (const result of successfulResults) {
        // Use tool name as key, or tool_ticker for multiple calls to same tool
        const ticker = (result.args as Record<string, unknown>).ticker as string | undefined;
        const key = ticker ? `${result.tool}_${ticker}` : result.tool;
        const formatter = MARKET_DATA_FORMATTERS[result.tool];
        combinedData[key] = formatter
          ? formatter(result.data, result.args as Record<string, unknown>)
          : result.data;
      }

      // Add errors if any
      if (failedResults.length > 0) {
        combinedData._errors = failedResults.map((r) => ({
          tool: r.tool,
          args: r.args,
          error: r.error,
        }));
      }

      return formatToolResult(combinedData, allUrls);
    },
  });
}
