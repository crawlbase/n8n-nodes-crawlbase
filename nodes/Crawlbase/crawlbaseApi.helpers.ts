import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/** Node options from the Options collection (maps to Crawling API query parameters). */
export interface CrawlbaseNodeOptions {
  pageWait?: number;
  country?: string;
  timeout?: number;
  /** JSON object serialized to API `request_headers` (pipe-separated name:value). */
  customHeaders?: string | Record<string, string>;
  pretty?: boolean;
  userAgent?: string;
  ajaxWait?: boolean;
  cssClickSelector?: string;
  device?: string;
  getCookies?: boolean;
  getHeaders?: boolean;
  cookies?: string;
  cookiesSession?: string;
  screenshot?: boolean;
  screenshotMode?: string;
  screenshotWidth?: number;
  screenshotHeight?: number;
  store?: boolean;
  scraper?: string;
  asyncCrawl?: boolean;
  autoparse?: boolean;
  torNetwork?: boolean;
  scroll?: boolean;
  scrollInterval?: number;
  customSuccessCodes?: string;
}

/** Normalized metadata from Crawling API response (headers or JSON body). */
export interface CrawlMetadata {
  originalStatus?: number;
  cbStatus?: number;
  url?: string;
}

/** Full normalized output for one crawl. */
export interface CrawlOutputItem {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  metadata: CrawlMetadata;
}

export function parseRequestHeadersJson(
  getNode: IExecuteFunctions['getNode'],
  value: string | Record<string, string> | undefined,
): Record<string, string> {
  if (value == null) return {};
  if (typeof value === 'object') return value;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '{}') return {};
  try {
    return JSON.parse(trimmed) as Record<string, string>;
  } catch {
    throw new NodeOperationError(
      getNode(),
      'request_headers (JSON) must be valid JSON (e.g. {"accept-language": "en-GB"}).',
    );
  }
}

/** Crawlbase API: `request_headers` as `name:value|name2:value2`. */
export function serializeRequestHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k}:${String(v).trim()}`)
    .join('|');
}

export function isValidCrawlUrl(url: string): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Pick Content-Type for POST/PUT body: JSON when the body is valid JSON object/array. */
export function inferPostBodyContentType(body: string): string {
  const t = body.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) {
    return 'application/x-www-form-urlencoded';
  }
  try {
    JSON.parse(t);
    return 'application/json';
  } catch {
    return 'application/x-www-form-urlencoded';
  }
}

function extractParsedBody(response: {
  headers?: Record<string, string>;
  body?: unknown;
}): { bodyStr: string; parsedForMeta: unknown } {
  const headers = (response.headers as Record<string, string>) ?? {};
  const raw = response.body;

  if (typeof raw === 'string') {
    const contentType = headers['content-type'] ?? '';
    let parsedForMeta: unknown;
    if (contentType.includes('json') && raw) {
      try {
        parsedForMeta = JSON.parse(raw);
      } catch {
        parsedForMeta = undefined;
      }
    } else {
      parsedForMeta = undefined;
    }
    return { bodyStr: raw, parsedForMeta };
  }

  if (raw != null && typeof raw === 'object') {
    return { bodyStr: JSON.stringify(raw), parsedForMeta: raw };
  }

  return { bodyStr: '', parsedForMeta: undefined };
}

export function normalizeCrawlResponse(response: {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: unknown;
}): CrawlOutputItem {
  const statusCode = response.statusCode ?? 0;
  const headers = (response.headers as Record<string, string>) ?? {};
  const { bodyStr: body, parsedForMeta } = extractParsedBody(response);

  const isJsonResponse =
    parsedForMeta != null && typeof parsedForMeta === 'object' && 'original_status' in (parsedForMeta as object);
  const meta: CrawlMetadata = isJsonResponse
    ? {
        originalStatus: (parsedForMeta as { original_status?: number }).original_status,
        cbStatus:
          (parsedForMeta as { cb_status?: number }).cb_status ??
          (parsedForMeta as { pc_status?: number }).pc_status,
        url: (parsedForMeta as { url?: string }).url ?? headers.url,
      }
    : {
        originalStatus: headers.original_status ? Number(headers.original_status) : undefined,
        cbStatus: headers.cb_status
          ? Number(headers.cb_status)
          : headers.pc_status
            ? Number(headers.pc_status)
            : undefined,
        url:
          headers.url ??
          (parsedForMeta != null && typeof parsedForMeta === 'object' && 'url' in (parsedForMeta as object)
            ? (parsedForMeta as { url: string }).url
            : undefined),
      };

  return { statusCode, headers, body, metadata: meta };
}

/** Build Crawling API query string parameters from node options. */
export function buildCrawlbaseQs(
  opts: CrawlbaseNodeOptions,
  url: string,
  format: string,
  getNode: IExecuteFunctions['getNode'],
): Record<string, string | number | boolean> {
  const qs: Record<string, string | number | boolean> = {
    url,
    format: format || 'html',
  };

  if (opts.pageWait != null && opts.pageWait > 0) {
    qs.page_wait = opts.pageWait;
  }
  if (opts.country?.trim()) {
    qs.country = opts.country.trim();
  }

  if (format === 'json' && opts.pretty === true) {
    qs.pretty = true;
  }
  if (opts.userAgent?.trim()) {
    qs.user_agent = opts.userAgent.trim();
  }
  if (opts.ajaxWait === true) {
    qs.ajax_wait = true;
  }
  if (opts.cssClickSelector?.trim()) {
    qs.css_click_selector = opts.cssClickSelector.trim();
  }
  if (opts.device === 'desktop' || opts.device === 'mobile') {
    qs.device = opts.device;
  }
  if (opts.getCookies === true) {
    qs.get_cookies = true;
  }
  if (opts.getHeaders === true) {
    qs.get_headers = true;
  }

  const rh = serializeRequestHeaders(parseRequestHeadersJson(getNode, opts.customHeaders));
  if (rh) {
    qs.request_headers = rh;
  }

  if (opts.cookies?.trim()) {
    qs.cookies = opts.cookies.trim();
  }
  if (opts.cookiesSession?.trim()) {
    const s = opts.cookiesSession.trim();
    if (s.length > 32) {
      throw new NodeOperationError(getNode(), 'Cookies Session must be at most 32 characters.');
    }
    qs.cookies_session = s;
  }

  if (opts.screenshot === true) {
    qs.screenshot = true;
    if (opts.screenshotMode === 'viewport' || opts.screenshotMode === 'fullpage') {
      qs.mode = opts.screenshotMode;
    }
    if (opts.screenshotWidth != null && opts.screenshotWidth > 0) {
      qs.width = opts.screenshotWidth;
    }
    if (opts.screenshotHeight != null && opts.screenshotHeight > 0) {
      qs.height = opts.screenshotHeight;
    }
  }

  if (opts.store === true) {
    qs.store = true;
  }
  if (opts.scraper?.trim()) {
    qs.scraper = opts.scraper.trim();
  }
  if (opts.asyncCrawl === true) {
    qs.async = true;
  }
  if (opts.autoparse === true) {
    qs.autoparse = true;
  }
  if (opts.torNetwork === true) {
    qs.tor_network = true;
  }
  if (opts.scroll === true) {
    qs.scroll = true;
    if (opts.scrollInterval != null && opts.scrollInterval > 0) {
      qs.scroll_interval = opts.scrollInterval;
    }
  }
  if (opts.customSuccessCodes?.trim()) {
    qs.custom_success_codes = opts.customSuccessCodes.trim();
  }

  return qs;
}
