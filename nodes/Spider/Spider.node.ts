import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const SPIDER_BASE_URL = 'https://api.spider.cloud';

export class Spider implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Spider',
		name: 'spider',
		icon: 'file:spider.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Crawl and scrape websites using the Spider API',
		defaults: {
			name: 'Spider',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'spiderApi',
				required: true,
			},
		],
		properties: [
			// ─── Operation ───────────────────────────────────────────────────────────
			// eslint-disable-next-line @n8n/community-nodes/resource-operation-pattern
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'scrape',
				options: [
					{
						name: 'Crawl',
						value: 'crawl',
						description: 'Crawl a website and extract content from multiple pages',
						action: 'Crawl a website',
					},
					{
						name: 'Get Credits',
						value: 'credits',
						description: 'Check available API credits',
						action: 'Get API credits',
					},
					{
						name: 'Links',
						value: 'links',
						description: 'Extract all links from a page',
						action: 'Extract links from a page',
					},
					{
						name: 'Scrape',
						value: 'scrape',
						description: 'Scrape content from a single page',
						action: 'Scrape a page',
					},
					{
						name: 'Screenshot',
						value: 'screenshot',
						description: 'Capture a screenshot of a page',
						action: 'Screenshot a page',
					},
					{
						name: 'Search',
						value: 'search',
						description: 'Search the web and optionally retrieve page content',
						action: 'Search the web',
					},
					{
						name: 'Transform',
						value: 'transform',
						description: 'Fetch a URL and convert its content to another format',
						action: 'Transform page content',
					},
				],
			},

			// ─── URL (crawl, scrape, links, screenshot, transform) ────────────────
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://example.com',
				description: 'The URL to process',
				displayOptions: {
					show: {
						operation: ['crawl', 'scrape', 'links', 'screenshot', 'transform'],
					},
				},
			},

			// ─── Search query ─────────────────────────────────────────────────────
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. latest AI research papers',
				description: 'The search query',
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
			},

			// ─── Crawl: page limit ────────────────────────────────────────────────
			{
				displayName: 'Page Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				description: 'Max number of results to return',
				typeOptions: { minValue: 1 },
				displayOptions: {
					show: {
						operation: ['crawl'],
					},
				},
			},

			// ─── Search: result count ─────────────────────────────────────────────
			{
				displayName: 'Number of Results',
				name: 'num',
				type: 'number',
				default: 5,
				description: 'Number of search results to return',
				typeOptions: { minValue: 1 },
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
			},

			// ─── Return format ────────────────────────────────────────────────────
			{
				displayName: 'Return Format',
				name: 'returnFormat',
				type: 'options',
				default: 'markdown',
				description: 'Format of the extracted content',
				options: [
					{
						name: 'Markdown',
						value: 'markdown',
						description: 'Clean markdown — best for LLMs and RAG pipelines',
					},
					{
						name: 'HTML',
						value: 'html',
						description: 'Raw HTML content',
					},
					{
						name: 'Plain Text',
						value: 'text',
						description: 'Plain text without markup',
					},
					{
						name: 'XML',
						value: 'xml',
						description: 'XML format',
					},
				],
				displayOptions: {
					show: {
						operation: ['crawl', 'scrape', 'search', 'transform'],
					},
				},
			},

			// ─── Output mode ──────────────────────────────────────────────────────
			{
				displayName: 'Output Mode',
				name: 'outputMode',
				type: 'options',
				default: 'splitItems',
				description: 'How to return multi-page results',
				options: [
					{
						name: 'One Item per Page',
						value: 'splitItems',
						description: 'Each page / result becomes a separate n8n item',
					},
					{
						name: 'All Pages in One Item',
						value: 'allItems',
						description: 'Return all pages as an array in a single item',
					},
				],
				displayOptions: {
					show: {
						operation: ['crawl', 'search', 'links'],
					},
				},
			},

			// ─── Additional fields ────────────────────────────────────────────────
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						operation: ['crawl', 'scrape', 'search', 'links', 'screenshot', 'transform'],
					},
				},
				options: [
					{
						displayName: 'Anti-Bot Protection',
						name: 'anti_bot',
						type: 'boolean',
						default: false,
						description: 'Whether to enable anti-bot bypass for protected pages',
					},
					{
						displayName: 'Crawl Depth',
						name: 'depth',
						type: 'number',
						default: 1,
						description: 'Maximum depth to follow links from the starting URL',
					},
					{
						displayName: 'Enable Proxy',
						name: 'proxy_enabled',
						type: 'boolean',
						default: false,
						description: 'Whether to route requests through rotating proxies',
					},
					{
						displayName: 'Fetch Page Content',
						name: 'fetch_page_content',
						type: 'boolean',
						default: false,
						description: 'Whether to retrieve the full page content for each search result',
					},
					{
						displayName: 'Headless Browser',
						name: 'headless',
						type: 'boolean',
						default: false,
						description:
							'Whether to render JavaScript using a headless browser (slower but handles dynamic pages)',
					},
					{
						displayName: 'Include Metadata',
						name: 'metadata',
						type: 'boolean',
						default: false,
						description: 'Whether to include page metadata (title, description, etc.) in the response',
					},
					{
						displayName: 'Readability Mode',
						name: 'readability',
						type: 'boolean',
						default: false,
						description: 'Whether to apply readability processing to extract the main article content',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('spiderApi');
		const authHeaders = {
			Authorization: `Bearer ${credentials.apiKey as string}`,
			'Content-Type': 'application/json',
		};

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;

			try {
				// ── Get Credits ────────────────────────────────────────────────────
				if (operation === 'credits') {
					const response = (await this.helpers.httpRequest({
						method: 'GET',
						url: `${SPIDER_BASE_URL}/data/credits`,
						headers: authHeaders,
						json: true,
					})) as IDataObject;

					returnData.push({ json: response, pairedItem: { item: i } });
					continue;
				}

				// ── Search ─────────────────────────────────────────────────────────
				if (operation === 'search') {
					const query = this.getNodeParameter('query', i) as string;
					const num = this.getNodeParameter('num', i) as number;
					const returnFormat = this.getNodeParameter('returnFormat', i) as string;
					const outputMode = this.getNodeParameter('outputMode', i) as string;
					const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

					const body: IDataObject = {
						search: query,
						num,
						return_format: returnFormat,
					};

					if (additionalFields.fetch_page_content !== undefined) {
						body.fetch_page_content = additionalFields.fetch_page_content;
					}
					if (additionalFields.anti_bot !== undefined) body.anti_bot = additionalFields.anti_bot;
					if (additionalFields.proxy_enabled !== undefined)
						body.proxy_enabled = additionalFields.proxy_enabled;

					const response = (await this.helpers.httpRequest({
						method: 'POST',
						url: `${SPIDER_BASE_URL}/search`,
						headers: authHeaders,
						body,
						json: true,
					})) as IDataObject[];

					const results = Array.isArray(response) ? response : [response];

					if (outputMode === 'splitItems') {
						for (const result of results) {
							returnData.push({ json: result as IDataObject, pairedItem: { item: i } });
						}
					} else {
						returnData.push({ json: { results }, pairedItem: { item: i } });
					}
					continue;
				}

				// ── URL-based operations ───────────────────────────────────────────
				const url = this.getNodeParameter('url', i) as string;
				const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

				const body: IDataObject = { url };

				if (additionalFields.anti_bot !== undefined) body.anti_bot = additionalFields.anti_bot;
				if (additionalFields.proxy_enabled !== undefined)
					body.proxy_enabled = additionalFields.proxy_enabled;
				if (additionalFields.headless !== undefined) body.headless = additionalFields.headless;
				if (additionalFields.readability !== undefined)
					body.readability = additionalFields.readability;
				if (additionalFields.metadata !== undefined) body.metadata = additionalFields.metadata;

				// ── Crawl ──────────────────────────────────────────────────────────
				if (operation === 'crawl') {
					const limit = this.getNodeParameter('limit', i) as number;
					const returnFormat = this.getNodeParameter('returnFormat', i) as string;
					const outputMode = this.getNodeParameter('outputMode', i) as string;

					body.limit = limit;
					body.return_format = returnFormat;
					if (additionalFields.depth !== undefined) body.depth = additionalFields.depth;

					const response = (await this.helpers.httpRequest({
						method: 'POST',
						url: `${SPIDER_BASE_URL}/crawl`,
						headers: authHeaders,
						body,
						json: true,
					})) as IDataObject[];

					const pages = Array.isArray(response) ? response : [response];

					if (outputMode === 'splitItems') {
						for (const page of pages) {
							returnData.push({ json: page as IDataObject, pairedItem: { item: i } });
						}
					} else {
						returnData.push({ json: { pages }, pairedItem: { item: i } });
					}

					// ── Scrape ─────────────────────────────────────────────────────
				} else if (operation === 'scrape') {
					const returnFormat = this.getNodeParameter('returnFormat', i) as string;
					body.return_format = returnFormat;

					const response = (await this.helpers.httpRequest({
						method: 'POST',
						url: `${SPIDER_BASE_URL}/scrape`,
						headers: authHeaders,
						body,
						json: true,
					})) as IDataObject[];

					const pages = Array.isArray(response) ? response : [response];
					returnData.push({
						json: (pages[0] ?? response) as IDataObject,
						pairedItem: { item: i },
					});

					// ── Links ──────────────────────────────────────────────────────
				} else if (operation === 'links') {
					const outputMode = this.getNodeParameter('outputMode', i) as string;

					if (additionalFields.depth !== undefined) body.depth = additionalFields.depth;

					const response = (await this.helpers.httpRequest({
						method: 'POST',
						url: `${SPIDER_BASE_URL}/links`,
						headers: authHeaders,
						body,
						json: true,
					})) as IDataObject[];

					const results = Array.isArray(response) ? response : [response];

					if (outputMode === 'splitItems') {
						for (const result of results) {
							returnData.push({ json: result as IDataObject, pairedItem: { item: i } });
						}
					} else {
						returnData.push({ json: { results }, pairedItem: { item: i } });
					}

					// ── Screenshot ─────────────────────────────────────────────────
				} else if (operation === 'screenshot') {
					const response = (await this.helpers.httpRequest({
						method: 'POST',
						url: `${SPIDER_BASE_URL}/screenshot`,
						headers: authHeaders,
						body,
						json: true,
					})) as IDataObject[];

					const results = Array.isArray(response) ? response : [response];
					returnData.push({
						json: (results[0] ?? response) as IDataObject,
						pairedItem: { item: i },
					});

					// ── Transform ──────────────────────────────────────────────────
				} else if (operation === 'transform') {
					const returnFormat = this.getNodeParameter('returnFormat', i) as string;
					body.return_format = returnFormat;

					const response = (await this.helpers.httpRequest({
						method: 'POST',
						url: `${SPIDER_BASE_URL}/transform`,
						headers: authHeaders,
						body,
						json: true,
					})) as IDataObject[];

					const results = Array.isArray(response) ? response : [response];
					returnData.push({
						json: (results[0] ?? response) as IDataObject,
						pairedItem: { item: i },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
