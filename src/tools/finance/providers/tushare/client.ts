import type { ProviderQueryResult, ProviderSource } from '../../domain/provider.js';

const DEFAULT_TUSHARE_URL = 'http://api.tushare.pro';

type TushareValue = string | number | boolean | null;

export interface TushareQueryOptions {
  params?: Record<string, TushareValue | undefined>;
  fields?: string[] | string;
}

interface TushareResponse {
  code: number;
  msg: string | null;
  data?: {
    fields?: string[];
    items?: TushareValue[][];
  };
}

export class TushareError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
    readonly apiName: string,
  ) {
    super(message);
    this.name = 'TushareError';
  }
}

function getToken(): string {
  const token = process.env.TUSHARE_API_TOKEN || process.env.TUSHARE_TOKEN;
  if (!token || token.trim().startsWith('your-')) {
    throw new TushareError('TUSHARE_API_TOKEN is not configured', undefined, 'auth');
  }
  return token.trim();
}

function fieldsToString(fields: string[] | string | undefined): string {
  if (!fields) return '';
  return Array.isArray(fields) ? fields.join(',') : fields;
}

function sanitizeParams(params: Record<string, TushareValue | undefined>): Record<string, TushareValue> {
  const cleaned: Record<string, TushareValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') cleaned[key] = value;
  }
  return cleaned;
}

function mapRecords(fields: string[], items: TushareValue[][]): Record<string, unknown>[] {
  return items.map((row) => {
    const record: Record<string, unknown> = {};
    fields.forEach((field, index) => {
      record[field] = row[index] ?? null;
    });
    return record;
  });
}

function buildSafeUrl(apiName: string, params: Record<string, TushareValue>, fields: string): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, String(value));
  }
  if (fields) query.set('fields', fields);
  const suffix = query.toString();
  return suffix ? `tushare://${apiName}?${suffix}` : `tushare://${apiName}`;
}

export class TushareClient {
  constructor(private readonly endpoint = process.env.TUSHARE_API_URL || DEFAULT_TUSHARE_URL) {}

  async query(apiName: string, options: TushareQueryOptions = {}): Promise<ProviderQueryResult> {
    const params = sanitizeParams(options.params ?? {});
    const fields = fieldsToString(options.fields);
    const token = getToken();

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_name: apiName,
          token,
          params,
          fields,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TushareError(`[Tushare API] request failed for ${apiName}: ${message}`, undefined, apiName);
    }

    if (!response.ok) {
      throw new TushareError(`[Tushare API] request failed for ${apiName}: ${response.status} ${response.statusText}`, response.status, apiName);
    }

    const payload = await response.json().catch(() => {
      throw new TushareError(`[Tushare API] invalid JSON for ${apiName}`, undefined, apiName);
    }) as TushareResponse;

    if (payload.code !== 0) {
      throw new TushareError(`[Tushare API] ${apiName} failed: ${payload.msg ?? `code ${payload.code}`}`, payload.code, apiName);
    }

    const records = mapRecords(payload.data?.fields ?? [], payload.data?.items ?? []);
    const source: ProviderSource = {
      provider: 'tushare',
      apiName,
      url: buildSafeUrl(apiName, params, fields),
      fetchedAt: new Date().toISOString(),
    };

    return { records, source };
  }
}

