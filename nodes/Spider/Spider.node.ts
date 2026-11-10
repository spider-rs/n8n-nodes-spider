import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const BASE_URL = 'https://api.spider.cloud';

// Version 1 had one flat operation list. Version 2 groups the same operations
// under resources. Both versions share the operation values, so every other
// parameter and the execute code work for either version.
const v1OperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	default: 'scrape',
	displayOptions: { show: { '@version': [1] } },
	options: [
		{ name: 'Crawl', value: 'crawl', action: 'Crawl a website' },
		{ name: 'Get Credits', value: 'credits', action: 'Get API credits' },
		{ name: 'Links', value: 'links', action: 'Extract links from a page' },
		{ name: 'Scrape', value: 'scrape', action: 'Scrape a page' },
		{ name: 'Screenshot', value: 'screenshot', action: 'Screenshot a page' },
		{ name: 'Search', value: 'search', action: 'Search the web' },
		{ name: 'Transform', value: 'transform', action: 'Transform page content' },
	],
};

const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	default: 'page',
	displayOptions: { show: { '@version': [2] } },
	options: [
		{ name: 'Account', value: 'account' },
		{ name: 'Page', value: 'page' },
		{ name: 'Web', value: 'web' },
		{ name: 'Website', value: 'website' },
	],
};

const v2OperationProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'scrape',
		displayOptions: { show: { '@version': [2], resource: ['page'] } },
		options: [
			{
				name: 'Scrape',
				value: 'scrape',
				description: 'Fetch one page and return its content',
				action: 'Scrape a page',
			},
			{
				name: 'Screenshot',
				value: 'screenshot',
				description: 'Render a page in a browser and return an image',
				action: 'Screenshot a page',
			},
			{
				name: 'Transform',
				value: 'transform',
				description: 'Convert HTML you already have to markdown or text, without fetching',
				action: 'Transform HTML',
			},
		],
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'crawl',
		displayOptions: { show: { '@version': [2], resource: ['website'] } },
		options: [
			{
				name: 'Crawl',
				value: 'crawl',
				description: 'Follow links from a start URL and return the content of each page',
				action: 'Crawl a website',
			},
			{
				name: 'Get Links',
				value: 'links',
				description: 'Follow links from a start URL and return the URLs only, without content',
				action: 'Get links from a website',
			},
		],
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'search',
		displayOptions: { show: { '@version': [2], resource: ['web'] } },
		options: [
			{
				name: 'Search',
				value: 'search',
				description: 'Search the web and optionally fetch the content of each result',
				action: 'Search the web',
			},
		],
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'credits',
		displayOptions: { show: { '@version': [2], resource: ['account'] } },
		options: [
			{
				name: 'Get Credits',
				value: 'credits',
				description: 'Return the remaining credit balance',
				action: 'Get credit balance',
			},
		],
	},
];

const RETURN_FORMATS = [
	{
		name: 'Markdown',
		value: 'markdown',
		description: 'Markdown, the usual choice for LLM input',
	},
	{
		name: 'CommonMark',
		value: 'commonmark',
		description: 'Strict CommonMark markdown',
	},
	{
		name: 'Plain Text',
		value: 'text',
		description: 'Text with the markup removed',
	},
	{
		name: 'Raw HTML',
		value: 'raw',
		description: 'The page HTML as the server sent it',
	},
	{
		name: 'XML',
		value: 'xml',
		description: 'The page as XML',
	},
];

function toApiReturnFormat(value: string): string {
	// Version 1 offered "html", which the API does not know. It means raw HTML.
	return value === 'html' ? 'raw' : value;
}

function applyFetchOptions(body: IDataObject, fields: IDataObject): void {
	if (fields.request !== undefined) body.request = fields.request;
	if (fields.stealth !== undefined) body.stealth = fields.stealth;
	if (fields.readability !== undefined) body.readability = fields.readability;
	if (fields.metadata !== undefined) body.metadata = fields.metadata;
	if (fields.country_code) body.country_code = fields.country_code;
	if (fields.root_selector) body.root_selector = fields.root_selector;
	if (fields.filter_output_main_only !== undefined)
		body.filter_output_main_only = fields.filter_output_main_only;
	if (fields.request_timeout !== undefined) body.request_timeout = fields.request_timeout;

	// Fields kept from version 1 workflows. The API ignores anti_bot and
	// proxy_enabled, so map them to the settings that do the job today.
	if (fields.headless === true && body.request === undefined) body.request = 'browser';
	if (fields.anti_bot === true && body.stealth === undefined) body.stealth = true;
}

function splitPatterns(value: unknown): string[] {
	if (typeof value !== 'string') return [];
	return value
		.split(',')
		.map((pattern) => pattern.trim())
		.filter((pattern) => pattern.length > 0);
}

export class Spider implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Spider',
		name: 'spider',
		icon: { light: 'file:spider.svg', dark: 'file:spider.dark.svg' },
		group: ['transform'],
		version: [1, 2],
		defaultVersion: 2,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Scrape, crawl and search the web with the Spider API',
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
			resourceProperty,
			v1OperationProperty,
			...v2OperationProperties,

			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. https://example.com',
				description: 'The page to fetch, or the start page of the crawl',
				displayOptions: {
					show: {
						operation: ['crawl', 'scrape', 'links', 'screenshot'],
					},
				},
			},
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. https://example.com',
				description: 'The page to fetch and convert',
				displayOptions: {
					show: {
						'@version': [1],
						operation: ['transform'],
					},
				},
			},
			{
				displayName: 'HTML',
				name: 'html',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				placeholder: 'e.g. <html><body><h1>Hello</h1></body></html>',
				description: 'The HTML to convert. Spider fetches nothing for this operation.',
				displayOptions: {
					show: {
						'@version': [2],
						operation: ['transform'],
					},
				},
			},
			{
				displayName: 'Source URL',
				name: 'sourceUrl',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/article',
				description: 'Where the HTML came from. Readability mode uses it to resolve the page.',
				displayOptions: {
					show: {
						'@version': [2],
						operation: ['transform'],
					},
				},
			},

			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. latest AI research papers',
				description: 'What to search the web for',
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
			},

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

			{
				displayName: 'Number of Results',
				name: 'num',
				type: 'number',
				default: 5,
				description: 'Maximum number of search results to return',
				typeOptions: { minValue: 1 },
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
			},

			{
				displayName: 'Return Format',
				name: 'returnFormat',
				type: 'options',
				default: 'markdown',
				description: 'Format of the page content in the output',
				options: RETURN_FORMATS,
				displayOptions: {
					show: {
						operation: ['crawl', 'scrape', 'search', 'transform'],
					},
				},
			},

			{
				displayName: 'Output Mode',
				name: 'outputMode',
				type: 'options',
				default: 'splitItems',
				description: 'How to return results that contain several pages',
				options: [
					{
						name: 'One Item per Page',
						value: 'splitItems',
						description: 'Each page or result becomes its own n8n item',
					},
					{
						name: 'All Pages in One Item',
						value: 'allItems',
						description: 'Return every page as an array in a single item',
					},
				],
				displayOptions: {
					show: {
						operation: ['crawl', 'search', 'links'],
					},
				},
			},

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
						displayName: 'Anti-Bot Protection (Legacy)',
						name: 'anti_bot',
						type: 'boolean',
						default: false,
						description: 'Whether to turn on stealth mode. Kept for version 1 workflows.',
						displayOptions: { show: { '@version': [1] } },
					},
					{
						displayName: 'Country Code',
						name: 'country_code',
						type: 'string',
						default: '',
						placeholder: 'e.g. gb',
						description: 'Two letter country code for the proxy exit',
						displayOptions: { hide: { '/operation': ['transform'] } },
					},
					{
						displayName: 'Crawl Depth',
						name: 'depth',
						type: 'number',
						default: 25,
						description:
							'Maximum number of links to follow away from the start URL. 0 removes the limit.',
						displayOptions: { show: { '/operation': ['crawl', 'links'] } },
					},
					{
						displayName: 'Exclude Paths',
						name: 'blacklist',
						type: 'string',
						default: '',
						placeholder: 'e.g. /blog/, /tag/',
						description: 'Comma-separated paths to skip. Regex is supported.',
						displayOptions: { show: { '/operation': ['crawl', 'links'] } },
					},
					{
						displayName: 'Fetch Mode',
						name: 'request',
						type: 'options',
						default: 'smart',
						description:
							'How Spider fetches the page. Smart tries a plain HTTP request first and uses a browser only when the page needs one.',
						options: [
							{ name: 'Smart', value: 'smart' },
							{ name: 'HTTP Only', value: 'http' },
							{ name: 'Browser', value: 'browser' },
						],
						displayOptions: { hide: { '/operation': ['transform'] } },
					},
					{
						displayName: 'Fetch Page Content',
						name: 'fetch_page_content',
						type: 'boolean',
						default: false,
						description: 'Whether to fetch the content of each search result',
						displayOptions: { show: { '/operation': ['search'] } },
					},
					{
						displayName: 'Full Page',
						name: 'full_page',
						type: 'boolean',
						default: true,
						description: 'Whether to capture the whole page instead of the visible viewport',
						displayOptions: { show: { '/operation': ['screenshot'] } },
					},
					{
						displayName: 'Headless Browser (Legacy)',
						name: 'headless',
						type: 'boolean',
						default: false,
						description: 'Whether to fetch with a browser. Kept for version 1 workflows.',
						displayOptions: { show: { '@version': [1] } },
					},
					{
						displayName: 'Include Metadata',
						name: 'metadata',
						type: 'boolean',
						default: false,
						description: 'Whether to add the title, description and keywords of each page',
						displayOptions: { hide: { '/operation': ['transform'] } },
					},
					{
						displayName: 'Include Paths Only',
						name: 'whitelist',
						type: 'string',
						default: '',
						placeholder: 'e.g. /docs/',
						description:
							'Comma-separated paths to crawl. Spider skips every other path. Regex is supported.',
						displayOptions: { show: { '/operation': ['crawl', 'links'] } },
					},
					{
						displayName: 'Main Content Only',
						name: 'filter_output_main_only',
						type: 'boolean',
						default: false,
						description: 'Whether to drop navigation, sidebars and footers from the output',
						displayOptions: { hide: { '/operation': ['transform', 'screenshot'] } },
					},
					{
						displayName: 'Readability Mode',
						name: 'readability',
						type: 'boolean',
						default: false,
						description:
							'Whether to strip boilerplate and keep the main article text before converting',
					},
					{
						displayName: 'Request Timeout',
						name: 'request_timeout',
						type: 'number',
						default: 60,
						typeOptions: { minValue: 5, maxValue: 255 },
						description: 'Seconds to wait for each page, from 5 to 255',
						displayOptions: { hide: { '/operation': ['transform'] } },
					},
					{
						displayName: 'Root Selector',
						name: 'root_selector',
						type: 'string',
						default: '',
						placeholder: 'e.g. #content',
						description: 'CSS selector of the part of the page to keep',
						displayOptions: { hide: { '/operation': ['transform', 'screenshot'] } },
					},
					{
						displayName: 'Stealth',
						name: 'stealth',
						type: 'boolean',
						default: false,
						description:
							'Whether to use stealth mode for pages that refuse plain requests or show a challenge page. Costs more per page.',
						displayOptions: { hide: { '/operation': ['transform'] } },
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const nodeVersion = this.getNode().typeVersion;

		const call = async (options: Omit<IHttpRequestOptions, 'baseURL' | 'json'>) =>
			(await this.helpers.httpRequestWithAuthentication.call(this, 'spiderApi', {
				baseURL: BASE_URL,
				json: true,
				...options,
			})) as IDataObject | IDataObject[];

		const pushResults = (results: IDataObject[], outputMode: string, key: string, i: number) => {
			if (outputMode === 'splitItems') {
				for (const result of results) {
					returnData.push({ json: result, pairedItem: { item: i } });
				}
			} else {
				returnData.push({ json: { [key]: results }, pairedItem: { item: i } });
			}
		};

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;

			if (operation === 'transform' && nodeVersion >= 2 && !this.getNodeParameter('html', i)) {
				const message =
					"The 'HTML' field is empty. Pass the HTML to convert, for example from an earlier HTTP Request node.";
				if (this.continueOnFail()) {
					returnData.push({ json: { error: message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), message, { itemIndex: i });
			}

			try {
				if (operation === 'credits') {
					const response = await call({ method: 'GET', url: '/data/credits' });
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
					continue;
				}

				const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

				if (operation === 'search') {
					const body: IDataObject = {
						search: this.getNodeParameter('query', i) as string,
						num: this.getNodeParameter('num', i) as number,
						return_format: toApiReturnFormat(this.getNodeParameter('returnFormat', i) as string),
					};
					if (additionalFields.fetch_page_content !== undefined) {
						body.fetch_page_content = additionalFields.fetch_page_content;
					}
					applyFetchOptions(body, additionalFields);

					const response = await call({ method: 'POST', url: '/search', body });
					const results = Array.isArray(response) ? response : [response];
					pushResults(results, this.getNodeParameter('outputMode', i) as string, 'results', i);
					continue;
				}

				if (operation === 'transform' && nodeVersion >= 2) {
					const html = this.getNodeParameter('html', i) as string;
					const sourceUrl = this.getNodeParameter('sourceUrl', i, '') as string;
					const document: IDataObject = { html };
					if (sourceUrl) document.url = sourceUrl;
					const body: IDataObject = {
						data: [document],
						return_format: toApiReturnFormat(this.getNodeParameter('returnFormat', i) as string),
					};
					if (additionalFields.readability !== undefined)
						body.readability = additionalFields.readability;

					const response = await call({ method: 'POST', url: '/transform', body });
					returnData.push({ json: response as IDataObject, pairedItem: { item: i } });
					continue;
				}

				const url = this.getNodeParameter('url', i) as string;
				const body: IDataObject = { url };
				applyFetchOptions(body, additionalFields);

				if (operation === 'crawl' || operation === 'links') {
					if (additionalFields.depth !== undefined) body.depth = additionalFields.depth;
					const blacklist = splitPatterns(additionalFields.blacklist);
					const whitelist = splitPatterns(additionalFields.whitelist);
					if (blacklist.length) body.blacklist = blacklist;
					if (whitelist.length) body.whitelist = whitelist;
				}

				if (operation === 'crawl') {
					body.limit = this.getNodeParameter('limit', i) as number;
					body.return_format = toApiReturnFormat(
						this.getNodeParameter('returnFormat', i) as string,
					);
					const response = await call({ method: 'POST', url: '/crawl', body });
					const pages = Array.isArray(response) ? response : [response];
					pushResults(pages, this.getNodeParameter('outputMode', i) as string, 'pages', i);
				} else if (operation === 'links') {
					const response = await call({ method: 'POST', url: '/links', body });
					const results = Array.isArray(response) ? response : [response];
					pushResults(results, this.getNodeParameter('outputMode', i) as string, 'results', i);
				} else if (operation === 'scrape' || operation === 'transform') {
					// Version 1 "Transform" took a URL. /transform fetches nothing, so a
					// version 1 Transform is a scrape in the chosen format.
					body.return_format = toApiReturnFormat(
						this.getNodeParameter('returnFormat', i) as string,
					);
					const response = await call({ method: 'POST', url: '/scrape', body });
					const pages = Array.isArray(response) ? response : [response];
					returnData.push({ json: pages[0] ?? {}, pairedItem: { item: i } });
				} else if (operation === 'screenshot') {
					if (additionalFields.full_page !== undefined) body.full_page = additionalFields.full_page;
					const response = await call({ method: 'POST', url: '/screenshot', body });
					const results = Array.isArray(response) ? response : [response];
					const result = results[0] ?? {};
					const item: INodeExecutionData = { json: result, pairedItem: { item: i } };
					if (typeof result.content === 'string' && result.content.length > 0) {
						item.binary = {
							data: await this.helpers.prepareBinaryData(
								Buffer.from(result.content, 'base64'),
								'screenshot.png',
								'image/png',
							),
						};
					}
					returnData.push(item);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
