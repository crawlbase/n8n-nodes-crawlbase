import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { CRAWLBASE_API_BASE, DEFAULT_TIMEOUT_MS } from './constants';
import type { CrawlbaseNodeOptions } from './crawlbaseApi.helpers';
import {
  buildCrawlbaseQs,
  inferPostBodyContentType,
  isValidCrawlUrl,
  normalizeCrawlResponse,
} from './crawlbaseApi.helpers';

/** One URL to crawl with its paired item index. */
interface WorkItem {
  url: string;
  pairedItem: { item: number };
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
    subtitle:
      '={{ $parameter["urlSource"] === "item" ? $parameter["method"] + " (from input)" : ($parameter["url"] ? $parameter["method"] + ": " + $parameter["url"] : $parameter["method"]) }}',
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
            displayName: 'ajax_wait',
            name: 'ajaxWait',
            type: 'boolean',
            default: false,
            description: 'With the JavaScript token: wait for AJAX to finish before capture',
          },
          {
            displayName: 'async',
            name: 'asyncCrawl',
            type: 'boolean',
            default: false,
            description: 'Asynchronous crawl; returns rid for Cloud Storage retrieval',
          },
          {
            displayName: 'autoparse',
            name: 'autoparse',
            type: 'boolean',
            default: false,
            description: 'Return structured scraped data as JSON when supported',
          },
          {
            displayName: 'cookies',
            name: 'cookies',
            type: 'string',
            default: '',
            placeholder: 'key1=value1; key2=value2',
            description: 'Cookie string sent to the target page',
          },
          {
            displayName: 'cookies_session',
            name: 'cookiesSession',
            type: 'string',
            default: '',
            placeholder: 'max 32 characters',
            description: 'Session id to persist cookies across calls; expires 300s after last call',
          },
          {
            displayName: 'country',
            name: 'country',
            type: 'string',
            default: '',
            placeholder: 'US',
            description: 'Two-letter country code for geo-targeted requests',
          },
          {
            displayName: 'css_click_selector',
            name: 'cssClickSelector',
            type: 'string',
            default: '',
            placeholder: '#button, body',
            description:
              'With the JS token: CSS selector to click before capture; use | for multiple steps. URL-encode special characters.',
          },
          {
            displayName: 'custom_success_codes',
            name: 'customSuccessCodes',
            type: 'string',
            default: '',
            placeholder: '403,429,503',
            description: 'Comma-separated HTTP status codes treated as success',
          },
          {
            displayName: 'device',
            name: 'device',
            type: 'options',
            default: '',
            options: [
              { name: 'Default', value: '' },
              { name: 'desktop', value: 'desktop' },
              { name: 'mobile', value: 'mobile' },
            ],
            description: 'desktop or mobile',
          },
          {
            displayName: 'get_cookies',
            name: 'getCookies',
            type: 'boolean',
            default: false,
            description: 'Return Set-Cookie from the target in original_set_cookie',
          },
          {
            displayName: 'get_headers',
            name: 'getHeaders',
            type: 'boolean',
            default: false,
            description: 'Return response headers from the target',
          },
          {
            displayName: 'height',
            name: 'screenshotHeight',
            type: 'number',
            default: 0,
            description: 'With screenshot=true and mode=viewport: max height in pixels',
            displayOptions: { show: { screenshot: [true] } },
          },
          {
            displayName: 'mode',
            name: 'screenshotMode',
            type: 'options',
            default: 'fullpage',
            options: [
              { name: 'fullpage', value: 'fullpage' },
              { name: 'viewport', value: 'viewport' },
            ],
            description: 'Screenshot capture mode when screenshot=true',
            displayOptions: { show: { screenshot: [true] } },
          },
          {
            displayName: 'page_wait',
            name: 'pageWait',
            type: 'number',
            default: 0,
            description: 'With the JavaScript token: milliseconds to wait before capture',
          },
          {
            displayName: 'pretty',
            name: 'pretty',
            type: 'boolean',
            default: false,
            description: 'When format is JSON, pretty-print the response',
            displayOptions: { show: { '/format': ['json'] } },
          },
          {
            displayName: 'request_headers',
            name: 'customHeaders',
            type: 'json',
            default: '{}',
            description:
              'JSON object of header names to values; sent as API request_headers (pipe-separated name:value)',
          },
          {
            displayName: 'screenshot',
            name: 'screenshot',
            type: 'boolean',
            default: false,
            description: 'With the JS token: return a JPEG screenshot URL',
          },
          {
            displayName: 'scraper',
            name: 'scraper',
            type: 'string',
            default: '',
            placeholder: 'amazon-product-details',
            description: 'Named data scraper id; see Crawlbase dashboard',
          },
          {
            displayName: 'scroll',
            name: 'scroll',
            type: 'boolean',
            default: false,
            description: 'With the JS token: auto-scroll to load dynamic content',
          },
          {
            displayName: 'scroll_interval',
            name: 'scrollInterval',
            type: 'number',
            default: 0,
            description: 'Seconds to scroll (1–60; default 10 if unset when scroll is enabled)',
            displayOptions: { show: { scroll: [true] } },
          },
          {
            displayName: 'store',
            name: 'store',
            type: 'boolean',
            default: false,
            description: 'Store the response in Crawlbase Cloud Storage; returns storage_url',
          },
          {
            displayName: 'timeout',
            name: 'timeout',
            type: 'number',
            default: DEFAULT_TIMEOUT_MS,
            description: 'HTTP client timeout in milliseconds (not a Crawlbase API parameter)',
          },
          {
            displayName: 'tor_network',
            name: 'torNetwork',
            type: 'boolean',
            default: false,
            description: 'Crawl onion sites over Tor',
          },
          {
            displayName: 'user_agent',
            name: 'userAgent',
            type: 'string',
            default: '',
            description: 'Custom User-Agent forwarded to the target URL',
          },
          {
            displayName: 'width',
            name: 'screenshotWidth',
            type: 'number',
            default: 0,
            description: 'With screenshot=true and mode=viewport: max width in pixels',
            displayOptions: { show: { screenshot: [true] } },
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

    const workItems = resolveWorkItems(this, items, urlSource);

    const node = this.getNode();

    for (let i = 0; i < workItems.length; i++) {
      const { url, pairedItem } = workItems[i];
      const format = this.getNodeParameter('format', pairedItem.item) as string;
      const method = this.getNodeParameter('method', pairedItem.item) as 'GET' | 'POST' | 'PUT';
      const options = this.getNodeParameter('options', pairedItem.item, {}) as CrawlbaseNodeOptions;
      const bodyParam = (this.getNodeParameter('body', pairedItem.item, '') as string).trim();

      const qs = buildCrawlbaseQs(options, url, format, this.getNode.bind(this));

      const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

      const requestOptions: IHttpRequestOptions = {
        url: CRAWLBASE_API_BASE,
        method,
        qs,
        returnFullResponse: true,
        timeout,
      };

      if ((method === 'POST' || method === 'PUT') && bodyParam) {
        requestOptions.body = bodyParam;
        requestOptions.headers = {
          'Content-Type': inferPostBodyContentType(bodyParam),
        };
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
              itemIndex: pairedItem.item,
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
      if (!isValidCrawlUrl(url)) {
        throw new NodeOperationError(
          ctx.getNode(),
          `[Item ${i + 1}] Please enter a valid URL starting with http or https.`,
          { itemIndex: i },
        );
      }
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
