# n8n-nodes-spider

![spider_n8n_node](https://github.com/user-attachments/assets/57588c9a-face-4e45-ac2a-cdec10dc53e9)

An n8n community node for the [Spider](https://spider.cloud/?utm_source=n8n&utm_medium=community_node&utm_campaign=n8n-nodes-spider) web crawling and scraping API. It crawls sites, scrapes single pages, searches the web, takes screenshots and converts HTML to markdown. Pages come back as markdown, text, raw HTML or XML, ready for an AI agent, a vector store or a spreadsheet.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Options](#options)
- [Use as an AI agent tool](#use-as-an-ai-agent-tool)
- [Example workflows](#example-workflows)
- [Errors](#errors)
- [Compatibility](#compatibility)
- [Upgrading from version 1 of the node](#upgrading-from-version-1-of-the-node)
- [Resources](#resources)

## Installation

In n8n, open **Settings > Community Nodes**, select **Install**, and enter `@spider-cloud/n8n-nodes-spider`. The [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) covers self-hosted setups and manual installs.

## Credentials

The node needs a Spider API key.

1. Create an account at [spider.cloud](https://spider.cloud/?utm_source=n8n&utm_medium=community_node&utm_campaign=n8n-nodes-spider). New accounts may get free credits to test with, if the signup passes Spider's checks ([FAQ](https://spider.cloud/faq/?utm_source=n8n&utm_medium=community_node&utm_campaign=n8n-nodes-spider)).
2. Create a key at [spider.cloud/api-keys](https://spider.cloud/api-keys?utm_source=n8n&utm_medium=community_node&utm_campaign=n8n-nodes-spider).
3. In n8n, add a **Spider API** credential and paste the key.

n8n tests the credential with `GET /data/credits`, which reads your balance and costs nothing.

## Operations

Operations are grouped by resource.

| Resource | Operation   | API endpoint        | What it does                                                                   |
| -------- | ----------- | ------------------- | ------------------------------------------------------------------------------ |
| Page     | Scrape      | `POST /scrape`      | Fetch one page and return its content                                          |
| Page     | Screenshot  | `POST /screenshot`  | Capture a PNG of a page, returned as n8n binary data in the `data` property    |
| Page     | Transform   | `POST /transform`   | Convert HTML you already have into markdown, text or XML. It fetches nothing.  |
| Website  | Crawl       | `POST /crawl`       | Follow links from a start URL and return each page found, up to the page limit |
| Website  | Get Links   | `POST /links`       | Crawl a site and return the URLs found, without page content                   |
| Web      | Search      | `POST /search`      | Search the web, and optionally fetch the content of each result                |
| Account  | Get Credits | `GET /data/credits` | Read the remaining credit balance                                              |

Crawl, Get Links and Search can return one n8n item per page (the default) or all pages in one item, set by **Output Mode**.

## Options

Each operation has an **Additional Fields** section. The common ones:

- **Fetch Mode** picks how Spider loads the page. Smart (the default) uses plain HTTP and switches to a browser when the page needs JavaScript. HTTP Only is the cheapest. Browser always renders.
- **Stealth** turns on Spider's anti-bot handling for sites that block plain requests.
- **Main Content Only** drops navigation, headers and footers from the output.
- **Readability Mode** runs the page through a reader view before conversion.
- **Root Selector** keeps only the part of the page that matches a CSS selector.
- **Country Code** routes the request through a proxy in that country, for example `us` or `de`.
- **Request Timeout** in seconds, from 5 to 255.
- **Include Metadata** adds the page title, description and other metadata.
- **Crawl Depth**, **Include Paths Only** and **Exclude Paths** limit a crawl. The path fields take a comma-separated list, for example `/docs/, /blog/`.
- **Full Page** captures the whole page in a screenshot instead of the visible window.
- **Fetch Page Content** makes Search fetch each result page, not only the title, link and snippet.

The [Spider API reference](https://spider.cloud/docs/api?utm_source=n8n&utm_medium=community_node&utm_campaign=n8n-nodes-spider) documents each parameter and what it costs.

## Use as an AI agent tool

The node can be attached to an n8n AI Agent as a tool. Add it from the agent's **Tool** connector, pick the resource and operation, and let the model fill a field with `$fromAI`, for example:

```
{{ $fromAI('url', 'The full URL of the page to read', 'string') }}
```

Self-hosted n8n needs `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` to use community nodes as tools.

## Example workflows

The [templates](templates/) folder holds three workflows you can import with **Workflows > Import from File**:

- [crawl-docs-to-vector-store.json](templates/crawl-docs-to-vector-store.json) crawls part of a docs site to markdown, splits and embeds it into an in-memory vector store, and gives a chat agent a tool that searches it.
- [competitor-prices-to-google-sheets.json](templates/competitor-prices-to-google-sheets.json) scrapes a list of pricing pages every morning, pulls out price strings, and appends a row per page to Google Sheets.
- [web-research-agent.json](templates/web-research-agent.json) is a chat agent with two Spider tools, Search and Scrape, that answers questions with cited links.

Each template has a sticky note with its setup steps. They need a Spider credential, and the first and third also need an OpenAI credential.

## Errors

The node reports the HTTP status and Spider's message. The ones you are most likely to see:

- `401` means the key is missing or wrong. Check the Spider API credential.
- `402` means the account is out of credits. Add credits at [spider.cloud/credits/new](https://spider.cloud/credits/new?utm_source=n8n&utm_medium=community_node&utm_campaign=n8n-nodes-spider).
- `429` means too many requests at once. Lower the batch size or add a Wait node.

Turn on **Continue On Fail** in the node settings to keep a workflow running when one URL fails.

## Compatibility

Tested with n8n 1.x and built with `@n8n/node-cli` 0.56. The node has no runtime dependencies.

## Upgrading from version 1 of the node

Version 2 adds the resource selector and fixes several fields that the Spider API no longer reads. Workflows built with version 1 keep working, because n8n keeps each node at the version it was created with. To move a node to version 2, add a new Spider node and copy the settings across.

What changed in version 2:

- Operations sit under the Account, Page, Web and Website resources. Links is now Website > Get Links.
- Transform converts HTML you pass in, through `POST /transform`. In version 1 it fetched a URL through `/scrape`, which is what Scrape already does.
- The Raw HTML return format sends `raw`. Version 1 sent `html`, which the API does not accept.
- Anti-Bot Protection and Headless Browser are replaced by Stealth and Fetch Mode. Version 1 nodes map the old fields to the new ones. The proxy toggle is gone, because the API has no such field.
- Screenshot returns n8n binary data as well as the base64 string.

## Resources

- [Spider API reference](https://spider.cloud/docs/api?utm_source=n8n&utm_medium=community_node&utm_campaign=n8n-nodes-spider)
- [Spider pricing](https://spider.cloud/credits/new?utm_source=n8n&utm_medium=community_node&utm_campaign=n8n-nodes-spider)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Report a problem](https://github.com/spider-rs/n8n-nodes-spider/issues)

## License

[MIT](LICENSE.md)
