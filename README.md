# n8n-nodes-crawlbase

Crawlbase node for [n8n](https://n8n.io). Crawl web pages with native **Crawlbase API** credentials and the **Crawling API** — no need to wire a generic HTTP Request node by hand.

## Features

- **Native credentials** — Add your Crawlbase API token once and use it across workflows; **Test connection** validates the token.
- **Crawling API** — Single node for GET/POST/PUT with URL (from parameter or from each input item).
- **Options** — Optional Crawling API parameters (for example `format`, `page_wait`, `country`, `request_headers`, cookies, `device`, scraper, screenshot, store, async, and JS rendering helpers), **request body** for POST/PUT, and an HTTP **timeout** on the client (not a Crawlbase query parameter). See [Crawling API parameters](https://crawlbase.com/docs/crawling-api/parameters) for the full list and behavior.
- **Normalized output** — Each item returns `statusCode`, `headers`, `body`, and `metadata` (including `originalStatus`, `cbStatus`, `url` where provided by the API).

## Installation

### In n8n (Community nodes)

1. In n8n, go to **Settings** → **Community nodes** → **Install a community node**.
2. Enter: `n8n-nodes-crawlbase`.
3. Install and restart if prompted.

### From source

```bash
npm install
npm run build
```

Then in n8n, add the path to this package (the directory containing this README) as a community node in **Settings** → **Community nodes**, or use `npm run dev` to run n8n with this node loaded locally.

## Credentials

1. Add a **Crawlbase API** credential (search for “Crawlbase” in the credential list).
2. Enter your **API Token** from the [Crawlbase dashboard](https://crawlbase.com/dashboard).
3. Click **Test connection** to confirm the token works.

## First crawl

1. Add a **Crawlbase** node to your workflow.
2. Select your Crawlbase API credential.
3. Enter a **URL** (e.g. `https://example.com`) or choose **From input item field** and set the field name.
4. Choose **Method** (GET/POST/PUT) and **Response format** (HTML, JSON, or Markdown).
5. Run the workflow. The node outputs `statusCode`, `headers`, `body`, and `metadata` for each URL.

## Item-list mode

- Set **URL Source** to **From input item field** and specify the field that contains the URL (e.g. `url`).
- Connect an input that provides one item per URL. The node runs one Crawling API request per item and returns one output item per input item.

## Rate limits and retries

Crawlbase applies rate limits depending on your plan. To avoid failures:

- Use n8n’s **Retry On Fail** on the Crawlbase node (node settings).
- Set **Wait Between Tries** to at least 1 second (or higher if you hit limits).
- For many URLs, consider splitting work (e.g. Loop Over Items / batching) so you don’t send bursts of requests.

## Example workflow

See [example-workflow.json](./example-workflow.json) for a workflow that crawls a single public URL and returns HTML. Import it in n8n via **Workflows** → **Import from file**.

## Verification and catalog

To get the node **verified** and listed in n8n’s integration catalog:

- Publish this package to npm as `n8n-nodes-crawlbase`.
- Ensure it meets [n8n’s verification guidelines](https://docs.n8n.io/integrations/community-nodes/build-community-nodes#submit-your-node-for-verification-by-n8n).
- Submit the node via the [n8n Creator Portal](https://creators.n8n.io/nodes).

## Links

- [Crawlbase Crawling API docs](https://crawlbase.com/docs/crawling-api)
- [Crawlbase dashboard](https://crawlbase.com/dashboard)
- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/)
- [n8n Creator Portal](https://creators.n8n.io/nodes)

## License

MIT

---

Copyright 2026 Crawlbase
