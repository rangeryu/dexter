import type { ChinaAssetType, ChinaExchange, ChinaSymbol } from '../domain/provider.js';

const COMMON_SYMBOLS: Record<string, ChinaSymbol> = {
  贵州茅台: makeSymbol('600519.SH', 'stock'),
  茅台: makeSymbol('600519.SH', 'stock'),
  宁德时代: makeSymbol('300750.SZ', 'stock'),
  比亚迪: makeSymbol('002594.SZ', 'stock'),
  中国平安: makeSymbol('601318.SH', 'stock'),
  招商银行: makeSymbol('600036.SH', 'stock'),
  平安银行: makeSymbol('000001.SZ', 'stock'),
  五粮液: makeSymbol('000858.SZ', 'stock'),
  迈瑞医疗: makeSymbol('300760.SZ', 'stock'),
  隆基绿能: makeSymbol('601012.SH', 'stock'),
  沪深300ETF: makeSymbol('510300.SH', 'etf'),
  沪深300: makeSymbol('510300.SH', 'etf'),
  上证50ETF: makeSymbol('510050.SH', 'etf'),
  科创50ETF: makeSymbol('588000.SH', 'etf'),
  创业板ETF: makeSymbol('159915.SZ', 'etf'),
  中证500ETF: makeSymbol('510500.SH', 'etf'),
  红利ETF: makeSymbol('510880.SH', 'etf'),
};

const CN_MARKET_TERMS = [
  'A股',
  'a股',
  '沪深',
  '上证',
  '深证',
  '深交所',
  '上交所',
  '北交所',
  '创业板',
  '科创板',
  '中证',
  '申万',
  '涨停',
  '跌停',
  '复权',
];

function makeSymbol(symbol: string, assetType?: ChinaAssetType): ChinaSymbol {
  const normalized = symbol.toUpperCase();
  const [code, exchange] = normalized.split('.') as [string, ChinaExchange];
  return {
    symbol: normalized,
    code,
    exchange,
    market: 'CN',
    assetType: assetType ?? inferAssetType(code),
  };
}

function inferExchange(code: string): ChinaExchange | undefined {
  if (/^(60|68|90|51|52|56|58)/.test(code)) return 'SH';
  if (/^(00|30|15|16|18|20|39)/.test(code)) return 'SZ';
  if (/^(43|83|87|88|92|42|82)/.test(code)) return 'BJ';
  return undefined;
}

function inferAssetType(code: string): ChinaAssetType {
  if (/^(51|52|56|58|15|16|18)/.test(code)) return 'etf';
  return 'stock';
}

function cleanInput(input: string): string {
  return input.trim().replace(/\s+/g, '').replace(/[，。；;：:]/g, '');
}

export function normalizeChinaSymbol(input: string): ChinaSymbol | null {
  const cleaned = cleanInput(input).toUpperCase();
  const suffixed = cleaned.match(/^(\d{6})\.(SH|SZ|BJ)$/);
  if (suffixed) {
    return makeSymbol(`${suffixed[1]}.${suffixed[2]}`);
  }

  const prefixed = cleaned.match(/^(SH|SZ|BJ)(\d{6})$/);
  if (prefixed) {
    return makeSymbol(`${prefixed[2]}.${prefixed[1]}`);
  }

  const bare = cleaned.match(/^\d{6}$/);
  if (!bare) return null;

  const exchange = inferExchange(cleaned);
  if (!exchange) return null;
  return makeSymbol(`${cleaned}.${exchange}`);
}

export function resolveKnownChinaSymbol(query: string): ChinaSymbol | null {
  const compact = query.replace(/\s+/g, '');
  const entries = Object.entries(COMMON_SYMBOLS).sort((a, b) => b[0].length - a[0].length);
  for (const [name, symbol] of entries) {
    if (compact.includes(name)) return symbol;
  }
  return null;
}

export function extractChinaSymbols(query: string): ChinaSymbol[] {
  const found = new Map<string, ChinaSymbol>();

  const explicitMatches = query.match(/\b\d{6}\.(?:SH|SZ|BJ)\b/gi) ?? [];
  for (const item of explicitMatches) {
    const symbol = normalizeChinaSymbol(item);
    if (symbol) found.set(symbol.symbol, symbol);
  }

  const bareMatches = query.match(/(?<!\d)\d{6}(?!\d)/g) ?? [];
  for (const item of bareMatches) {
    const symbol = normalizeChinaSymbol(item);
    if (symbol) found.set(symbol.symbol, symbol);
  }

  const known = resolveKnownChinaSymbol(query);
  if (known) found.set(known.symbol, known);

  return [...found.values()];
}

export function detectChinaMarketQuery(query: string): boolean {
  if (extractChinaSymbols(query).length > 0) return true;
  return CN_MARKET_TERMS.some((term) => query.includes(term));
}

export function resolveChinaSymbolOrThrow(input: string): ChinaSymbol {
  const direct = normalizeChinaSymbol(input);
  if (direct) return direct;

  const symbols = extractChinaSymbols(input);
  if (symbols.length > 0) return symbols[0]!;

  throw new Error(`Unable to resolve China market symbol from "${input}". Use a six digit code such as 600519.SH or 000001.SZ.`);
}
