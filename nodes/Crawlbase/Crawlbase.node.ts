import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { CRAWLBASE_API_BASE, CRAWL_URL_PREFIX, DEFAULT_TIMEOUT_MS } from './constants';

/** Node options from the Options collection. */
interface CrawlbaseNodeOptions {
  pageWait?: number;
  country?: string;
  timeout?: number;
  customHeaders?: string | Record<string, string>;
}

/** One URL to crawl with its paired item index. */
interface WorkItem {
  url: string;
  pairedItem: { item: number };
}

/** Normalized metadata from Crawling API response (headers or JSON body). */
interface CrawlMetadata {
  originalStatus?: number;
  cbStatus?: number;
  url?: string;
}

/** Full normalized output for one crawl. */
interface CrawlOutputItem {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  metadata: CrawlMetadata;
}

function parseCustomHeaders(
  getNode: IExecuteFunctions['getNode'],
  value: string | Record<string, string> | undefined,
): Record<string, string> {
  if (value == null) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value) as Record<string, string>;
  } catch {
    throw new NodeOperationError(getNode(), 'Custom Headers must be valid JSON (e.g. {"X-Header": "value"}).');
  }
}

function isValidCrawlUrl(url: string): boolean {
  return typeof url === 'string' && url.trim().startsWith(CRAWL_URL_PREFIX);
}

function normalizeCrawlResponse(response: {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: unknown;
}): CrawlOutputItem {
  const statusCode = response.statusCode ?? 0;
  const headers = (response.headers as Record<string, string>) ?? {};
  const body =
    typeof response.body === 'string' ? response.body : response.body != null ? JSON.stringify(response.body) : '';
  const contentType = headers['content-type'] ?? '';
  let jsonBody: unknown;
  if (contentType.includes('json') && body) {
    try {
      jsonBody = JSON.parse(body);
    } catch {
      jsonBody = undefined;
    }
  } else {
    jsonBody = undefined;
  }

  const isJsonResponse = jsonBody != null && typeof jsonBody === 'object' && 'original_status' in (jsonBody as object);
  const meta: CrawlMetadata = isJsonResponse
    ? {
        originalStatus: (jsonBody as { original_status?: number }).original_status,
        cbStatus: (jsonBody as { cb_status?: number }).cb_status ?? (jsonBody as { pc_status?: number }).pc_status,
        url: (jsonBody as { url?: string }).url ?? headers.url,
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
          (jsonBody != null && typeof jsonBody === 'object' && 'url' in (jsonBody as object)
            ? (jsonBody as { url: string }).url
            : undefined),
      };

  return { statusCode, headers, body, metadata: meta };
}

export class Crawlbase implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Crawlbase',
    name: 'crawlbase',
    icon: {
      light: 'file:../../icons/crawlbase.svg',
      dark: 'file:../../icons/crawlbase.dark.svg',
    },
    group: ['transform'],
    version: 1,
    subtitle: '={{ $parameter["urlSource"] === "item" ? $parameter["method"] + " (from input)" : ($parameter["url"] ? $parameter["method"] + ": " + $parameter["url"] : $parameter["method"]) }}',
    description: 'Crawl a URL with Crawlbase Crawling API',
    defaults: {
      name: 'Crawlbase',
      color: '#6366f1',
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'crawlbaseApi',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'URL Source',
        name: 'urlSource',
        type: 'options',
        default: 'parameter',
        options: [
          { name: 'From parameter below', value: 'parameter' },
          { name: 'From input item field', value: 'item' },
        ],
        description: 'Use a fixed URL or the URL from each input item',
      },
      {
        displayName: 'URL',
        name: 'url',
        type: 'string',
        default: '',
        placeholder: 'https://example.com',
        displayOptions: { show: { urlSource: ['parameter'] } },
        description: 'The URL to crawl (must start with http or https)',
      },
      {
        displayName: 'Input Field Name',
        name: 'urlField',
        type: 'string',
        default: 'url',
        displayOptions: { show: { urlSource: ['item'] } },
        description: 'Name of the input field containing the URL to crawl',
      },
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
        ],
      },
      {
        displayName: 'Response Format',
        name: 'format',
        type: 'options',
        default: 'html',
        options: [
          { name: 'HTML', value: 'html' },
          { name: 'JSON', value: 'json' },
        ],
        description: 'HTML returns raw body; JSON returns body plus status and metadata in one object',
      },
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add option',
        default: {},
        options: [
          {
            displayName: 'Page Wait (ms)',
            name: 'pageWait',
            type: 'number',
            default: 0,
            description: 'Time to wait for the page before returning (e.g. for JavaScript rendering)',
          },
          {
            displayName: 'Country',
            name: 'country',
            type: 'string',
            default: '',
            placeholder: 'US',
            description: 'Country code for geo-targeting where supported',
          },
          {
            displayName: 'Timeout (ms)',
            name: 'timeout',
            type: 'number',
            default: DEFAULT_TIMEOUT_MS,
            description: 'Request timeout in milliseconds',
          },
          {
            displayName: 'Custom Headers',
            name: 'customHeaders',
            type: 'json',
            default: '{}',
            description: 'Additional headers as JSON object (e.g. {"X-Custom": "value"})',
          },
        ],
      },
      {
        displayName: 'Request Body (POST/PUT)',
        name: 'body',
        type: 'string',
        default: '',
        displayOptions: { show: { method: ['POST', 'PUT'] } },
        description: 'Body to send with POST or PUT (e.g. form data or JSON string)',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const output: INodeExecutionData[] = [];

    const urlSource = this.getNodeParameter('urlSource', 0) as string;
    const method = this.getNodeParameter('method', 0) as 'GET' | 'POST' | 'PUT';
    const format = this.getNodeParameter('format', 0) as string;
    const options = this.getNodeParameter('options', 0, {}) as CrawlbaseNodeOptions;
    const bodyParam = (this.getNodeParameter('body', 0, '') as string).trim();

    const workItems = resolveWorkItems(this, items, urlSource);

    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const customHeaders = parseCustomHeaders(this.getNode.bind(this), options.customHeaders);
    const node = this.getNode();

    for (let i = 0; i < workItems.length; i++) {
      const { url, pairedItem } = workItems[i];
      const qs: Record<string, string | number> = {
        url,
        format: format || 'html',
      };
      if (options.pageWait != null && options.pageWait > 0) {
        qs.page_wait = options.pageWait;
      }
      if (options.country?.trim()) {
        qs.country = options.country.trim();
      }

      const requestOptions: IHttpRequestOptions = {
        url: CRAWLBASE_API_BASE,
        method,
        qs,
        returnFullResponse: true,
        timeout,
        headers: customHeaders,
      };

      if ((method === 'POST' || method === 'PUT') && bodyParam) {
        requestOptions.body = bodyParam;
        requestOptions.headers = { ...requestOptions.headers, 'Content-Type': 'application/x-www-form-urlencoded' };
      }

      try {
        const response = await this.helpers.httpRequestWithAuthentication.call(this, 'crawlbaseApi', requestOptions);
        const normalized = normalizeCrawlResponse(response);
        output.push({
          json: { ...normalized },
          pairedItem,
        });
      } catch (error) {
        if (this.continueOnFail()) {
          output.push({
            json: {
              statusCode: 0,
              body: '',
              headers: {},
              metadata: {},
              error: error instanceof Error ? error.message : String(error),
            },
            pairedItem,
          });
        } else {
          const message = error instanceof Error ? error.message : String(error);
          throw new NodeOperationError(
            node,
            `[Item ${i + 1}] Crawl failed: ${message}. Check the URL and your API token.`,
            {
              itemIndex: i,
              description: 'Ensure the URL is valid and your Crawlbase API token has credits.',
            },
          );
        }
      }
    }

    return [output];
  }
}

/** Build list of URLs to crawl from input items or single parameter. */
function resolveWorkItems(ctx: IExecuteFunctions, items: INodeExecutionData[], urlSource: string): WorkItem[] {
  const workItems: WorkItem[] = [];

  if (items.length === 0) {
    if (urlSource === 'item') {
      throw new NodeOperationError(
        ctx.getNode(),
        'No input items. Use "From parameter below" or connect an input with URLs.',
        {
          itemIndex: 0,
        },
      );
    }
    const url = (ctx.getNodeParameter('url', 0) as string)?.trim();
    if (!isValidCrawlUrl(url ?? '')) {
      throw new NodeOperationError(ctx.getNode(), 'Please enter a valid URL starting with http or https.', {
        itemIndex: 0,
      });
    }
    workItems.push({ url: url!, pairedItem: { item: 0 } });
    return workItems;
  }

  for (let i = 0; i < items.length; i++) {
    let url: string;
    if (urlSource === 'parameter') {
      url = (ctx.getNodeParameter('url', i) as string)?.trim() ?? '';
    } else {
      const urlField = ctx.getNodeParameter('urlField', i) as string;
      const val = items[i].json[urlField];
      if (val == null || typeof val !== 'string') {
        throw new NodeOperationError(
          ctx.getNode(),
          `[Item ${i + 1}] No URL found in field "${urlField}". Check the field name or use "From parameter below".`,
          { itemIndex: i },
        );
      }
      url = val.trim();
      if (!isValidCrawlUrl(url)) {
        throw new NodeOperationError(
          ctx.getNode(),
          `[Item ${i + 1}] URL in "${urlField}" must start with http or https.`,
          { itemIndex: i },
        );
      }
    }
    workItems.push({ url, pairedItem: { item: i } });
  }

  return workItems;
}
