import assert from 'node:assert/strict';
import test from 'node:test';
import type { IExecuteFunctions } from 'n8n-workflow';
import {
  buildCrawlbaseQs,
  inferPostBodyContentType,
  isValidCrawlUrl,
  normalizeCrawlResponse,
  parseRequestHeadersJson,
  serializeRequestHeaders,
} from './crawlbaseApi.helpers';

const mockGetNode = (() => ({})) as IExecuteFunctions['getNode'];

test('parseRequestHeadersJson: empty and object', () => {
  assert.deepEqual(parseRequestHeadersJson(mockGetNode, undefined), {});
  assert.deepEqual(parseRequestHeadersJson(mockGetNode, ''), {});
  assert.deepEqual(parseRequestHeadersJson(mockGetNode, '  '), {});
  assert.deepEqual(parseRequestHeadersJson(mockGetNode, '{}'), {});
  assert.deepEqual(parseRequestHeadersJson(mockGetNode, { a: 'b' }), { a: 'b' });
  assert.deepEqual(parseRequestHeadersJson(mockGetNode, '{"x": "y"}'), { x: 'y' });
});

test('parseRequestHeadersJson: invalid JSON throws', () => {
  assert.throws(() => parseRequestHeadersJson(mockGetNode, '{not json'), /valid JSON/);
});

test('serializeRequestHeaders', () => {
  assert.equal(serializeRequestHeaders({}), '');
  assert.equal(serializeRequestHeaders({ a: '  b  ', c: '' }), 'a:b');
  assert.equal(serializeRequestHeaders({ accept: 'text/html', lang: 'en' }), 'accept:text/html|lang:en');
});

test('isValidCrawlUrl', () => {
  assert.equal(isValidCrawlUrl(''), false);
  assert.equal(isValidCrawlUrl('ftp://x'), false);
  assert.equal(isValidCrawlUrl('https://example.com/path?q=1'), true);
  assert.equal(isValidCrawlUrl('  http://localhost  '), true);
});

test('inferPostBodyContentType', () => {
  assert.equal(inferPostBodyContentType('a=b&c=d'), 'application/x-www-form-urlencoded');
  assert.equal(inferPostBodyContentType('{"a":1}'), 'application/json');
  assert.equal(inferPostBodyContentType('  [1,2]  '), 'application/json');
  assert.equal(inferPostBodyContentType('{broken'), 'application/x-www-form-urlencoded');
});

test('normalizeCrawlResponse: string JSON body uses parse once', () => {
  const bodyObj = { original_status: 200, cb_status: 0, url: 'https://u' };
  const out = normalizeCrawlResponse({
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bodyObj),
  });
  assert.equal(out.statusCode, 200);
  assert.equal(out.metadata.originalStatus, 200);
  assert.equal(out.metadata.cbStatus, 0);
  assert.equal(out.metadata.url, 'https://u');
});

test('normalizeCrawlResponse: pre-parsed object body avoids stringify-parse for metadata', () => {
  const bodyObj = { original_status: 404, pc_status: 200, url: 'https://target' };
  const out = normalizeCrawlResponse({
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: bodyObj,
  });
  assert.equal(out.body, JSON.stringify(bodyObj));
  assert.equal(out.metadata.originalStatus, 404);
  assert.equal(out.metadata.cbStatus, 200);
  assert.equal(out.metadata.url, 'https://target');
});

test('normalizeCrawlResponse: HTML uses header metadata', () => {
  const out = normalizeCrawlResponse({
    statusCode: 200,
    headers: { original_status: '500', cb_status: '0', url: 'https://x' },
    body: '<html></html>',
  });
  assert.equal(out.metadata.originalStatus, 500);
  assert.equal(out.metadata.cbStatus, 0);
});

test('buildCrawlbaseQs: maps options and format', () => {
  const qs = buildCrawlbaseQs(
    {
      pageWait: 1000,
      country: ' US ',
      userAgent: ' UA ',
      ajaxWait: true,
      device: 'mobile',
      cookies: 'a=b',
      scraper: 'my-scraper',
      asyncCrawl: true,
    },
    'https://example.com',
    'json',
    mockGetNode,
  );
  assert.equal(qs.url, 'https://example.com');
  assert.equal(qs.format, 'json');
  assert.equal(qs.page_wait, 1000);
  assert.equal(qs.country, 'US');
  assert.equal(qs.user_agent, 'UA');
  assert.equal(qs.ajax_wait, true);
  assert.equal(qs.device, 'mobile');
  assert.equal(qs.cookies, 'a=b');
  assert.equal(qs.scraper, 'my-scraper');
  assert.equal(qs.async, true);
});

test('buildCrawlbaseQs: cookies_session over 32 chars throws', () => {
  const long = 'x'.repeat(33);
  assert.throws(
    () => buildCrawlbaseQs({ cookiesSession: long }, 'https://a.com', 'html', mockGetNode),
    /32 characters/,
  );
});
