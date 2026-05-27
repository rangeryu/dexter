import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ChinaFinanceProvider, ProviderQueryResult, ProviderSource } from '../../domain/provider.js';

const execFileAsync = promisify(execFile);

interface AkshareResponse {
  records?: Record<string, unknown>[];
  error?: string;
}

function source(apiName: string): ProviderSource {
  return {
    provider: 'akshare',
    apiName,
    url: `akshare://${apiName}`,
    fetchedAt: new Date().toISOString(),
  };
}

function empty(apiName: string): ProviderQueryResult {
  return { records: [], source: source(apiName) };
}

function yyyymmdd(date?: string): string | undefined {
  return date?.replaceAll('-', '');
}

const PYTHON_BRIDGE = String.raw`
import json
import sys

payload = json.loads(sys.argv[1])

def ts_code(code):
    code = str(code)
    if code.startswith(("60", "68", "90", "51", "52", "56", "58")):
        return f"{code}.SH"
    if code.startswith(("00", "30", "15", "16", "18", "20", "39")):
        return f"{code}.SZ"
    if code.startswith(("43", "83", "87", "88", "92", "42", "82")):
        return f"{code}.BJ"
    return code

def as_records(df, mapping):
    records = []
    for raw in df.to_dict("records"):
        row = {}
        for source_key, target_key in mapping.items():
            if source_key in raw:
                row[target_key] = raw[source_key]
        if "ts_code" not in row and "code" in payload:
            row["ts_code"] = payload["symbol"]
        records.append(row)
    return records

try:
    import akshare as ak
    action = payload["action"]
    code = str(payload.get("code", ""))
    start_date = payload.get("start_date")
    end_date = payload.get("end_date")

    if action == "stock_daily":
        df = ak.stock_zh_a_hist(symbol=code, period="daily", start_date=start_date, end_date=end_date, adjust="")
        records = as_records(df, {
            "日期": "trade_date",
            "开盘": "open",
            "收盘": "close",
            "最高": "high",
            "最低": "low",
            "涨跌额": "change",
            "涨跌幅": "pct_chg",
            "成交量": "vol",
            "成交额": "amount",
            "换手率": "turnover_rate",
        })
    elif action == "fund_daily":
        df = ak.fund_etf_hist_em(symbol=code, period="daily", start_date=start_date, end_date=end_date, adjust="")
        records = as_records(df, {
            "日期": "trade_date",
            "开盘": "open",
            "收盘": "close",
            "最高": "high",
            "最低": "low",
            "涨跌额": "change",
            "涨跌幅": "pct_chg",
            "成交量": "vol",
            "成交额": "amount",
            "换手率": "turnover_rate",
        })
    elif action == "stock_basic":
        df = ak.stock_info_a_code_name()
        records = [{"ts_code": ts_code(row.get("code")), "name": row.get("name")} for row in df.to_dict("records")]
    elif action == "daily_basic":
        df = ak.stock_zh_a_spot_em()
        records = []
        for row in df.to_dict("records"):
            code_value = str(row.get("代码", ""))
            record = {
                "ts_code": ts_code(code_value),
                "close": row.get("最新价"),
                "turnover_rate": row.get("换手率"),
                "pe_ttm": row.get("市盈率-动态"),
                "pb": row.get("市净率"),
                "total_mv": (row.get("总市值") or 0) / 10000 if row.get("总市值") is not None else None,
                "circ_mv": (row.get("流通市值") or 0) / 10000 if row.get("流通市值") is not None else None,
            }
            records.append(record)
    elif action == "fund_basic":
        df = ak.fund_etf_spot_em()
        records = [{"ts_code": ts_code(row.get("代码")), "name": row.get("名称")} for row in df.to_dict("records")]
    else:
        records = []

    print(json.dumps({"records": records}, ensure_ascii=False, default=str))
except Exception as exc:
    print(json.dumps({"error": str(exc)}, ensure_ascii=False))
    sys.exit(1)
`;

export class AkshareProvider implements ChinaFinanceProvider {
  constructor(
    private readonly pythonBin = process.env.AKSHARE_PYTHON_BIN || 'python3',
    private readonly timeoutMs = Number(process.env.AKSHARE_TIMEOUT_MS ?? 12_000),
  ) {}

  private async run(action: string, params: Record<string, unknown>): Promise<ProviderQueryResult> {
    const payload = JSON.stringify({ action, ...params });
    const { stdout } = await execFileAsync(this.pythonBin, ['-c', PYTHON_BRIDGE, payload], {
      timeout: this.timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout) as AkshareResponse;
    if (parsed.error) throw new Error(`[AkShare] ${action} failed: ${parsed.error}`);
    return { records: parsed.records ?? [], source: source(action) };
  }

  async getStockBasic(symbols?: string[]) {
    const result = await this.run('stock_basic', {});
    if (!symbols?.length) return result;
    const wanted = new Set(symbols);
    return { ...result, records: result.records.filter((row) => wanted.has(String(row.ts_code))) };
  }

  getDailyBars(symbol: string, startDate?: string, endDate?: string) {
    return this.run('stock_daily', {
      symbol,
      code: symbol.slice(0, 6),
      start_date: yyyymmdd(startDate),
      end_date: yyyymmdd(endDate),
    });
  }

  getFundDailyBars(symbol: string, startDate?: string, endDate?: string) {
    return this.run('fund_daily', {
      symbol,
      code: symbol.slice(0, 6),
      start_date: yyyymmdd(startDate),
      end_date: yyyymmdd(endDate),
    });
  }

  async getDailyBasic(symbol?: string) {
    const result = await this.run('daily_basic', {});
    if (!symbol) return result;
    return { ...result, records: result.records.filter((row) => String(row.ts_code) === symbol) };
  }

  getFinancialIndicators() {
    return Promise.resolve(empty('fina_indicator'));
  }

  getIncomeStatements() {
    return Promise.resolve(empty('income'));
  }

  getBalanceSheets() {
    return Promise.resolve(empty('balancesheet'));
  }

  getCashFlowStatements() {
    return Promise.resolve(empty('cashflow'));
  }

  getDisclosures() {
    return Promise.resolve(empty('anns_d'));
  }

  async getFundBasic(symbols?: string[]) {
    const result = await this.run('fund_basic', {});
    if (!symbols?.length) return result;
    const wanted = new Set(symbols);
    return { ...result, records: result.records.filter((row) => wanted.has(String(row.ts_code))) };
  }

  getFundPortfolio() {
    return Promise.resolve(empty('fund_portfolio'));
  }

  getTradeCalendar() {
    return Promise.resolve(empty('trade_cal'));
  }

  getDividends() {
    return Promise.resolve(empty('dividend'));
  }
}
