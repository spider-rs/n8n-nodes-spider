// Runs the built node against a mocked n8n context and checks the request
// bodies it sends to the Spider API. No network calls.
const assert = require('node:assert');
const { Spider } = require('../dist/nodes/Spider/Spider.node.js');
const test = require('node:test');
const node = new Spider();
async function run(version, params, response) {
	const calls = [];
	const ctx = {
		getInputData: () => [{ json: {} }],
		getNode: () => ({ name: 'Spider', typeVersion: version, type: 'x', parameters: {} }),
		getNodeParameter: (n, i, d) => (n in params ? params[n] : d),
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async (cred, opts) => {
				calls.push(opts);
				return response;
			},
			prepareBinaryData: async (buf, name, mime) => ({
				fileName: name,
				mimeType: mime,
				size: buf.length,
			}),
		},
	};
	const out = await node.execute.call(ctx);
	return { calls, out: out[0] };
}

test('request bodies match the Spider API', async () => {
	let r = await run(
		2,
		{
			operation: 'crawl',
			url: 'https://a.com',
			limit: 3,
			returnFormat: 'markdown',
			outputMode: 'splitItems',
			additionalFields: { blacklist: '/blog/, /tag/', request: 'browser', stealth: true },
		},
		[{ url: 'a' }, { url: 'b' }],
	);
	assert.equal(r.calls[0].url, '/crawl');
	assert.deepEqual(r.calls[0].body.blacklist, ['/blog/', '/tag/']);
	assert.equal(r.calls[0].body.request, 'browser');
	assert.equal(r.out.length, 2);
	r = await run(
		1,
		{
			operation: 'scrape',
			url: 'https://a.com',
			returnFormat: 'html',
			additionalFields: { headless: true, anti_bot: true, proxy_enabled: true },
		},
		[{ content: 'x' }],
	);
	assert.equal(r.calls[0].url, '/scrape');
	assert.equal(r.calls[0].body.return_format, 'raw');
	assert.equal(r.calls[0].body.request, 'browser');
	assert.equal(r.calls[0].body.stealth, true);
	assert.equal(r.calls[0].body.anti_bot, undefined);
	assert.equal(r.calls[0].body.proxy_enabled, undefined);
	r = await run(
		1,
		{ operation: 'transform', url: 'https://a.com', returnFormat: 'text', additionalFields: {} },
		[{ content: 'x' }],
	);
	assert.equal(r.calls[0].url, '/scrape');
	assert.equal(r.calls[0].body.return_format, 'text');
	r = await run(
		2,
		{
			operation: 'transform',
			html: '<h1>Hi</h1>',
			sourceUrl: 'https://a.com',
			returnFormat: 'markdown',
			additionalFields: {},
		},
		{ content: ['# Hi'] },
	);
	assert.equal(r.calls[0].url, '/transform');
	assert.deepEqual(r.calls[0].body.data, [{ html: '<h1>Hi</h1>', url: 'https://a.com' }]);
	assert.equal(r.calls[0].body.url, undefined);
	await assert.rejects(
		run(
			2,
			{ operation: 'transform', html: '', returnFormat: 'markdown', additionalFields: {} },
			{},
		),
		/HTML/,
	);
	r = await run(
		2,
		{ operation: 'screenshot', url: 'https://a.com', additionalFields: { full_page: false } },
		[{ content: Buffer.from('png').toString('base64') }],
	);
	assert.equal(r.calls[0].url, '/screenshot');
	assert.equal(r.calls[0].body.full_page, false);
	assert.equal(r.out[0].binary.data.mimeType, 'image/png');
	r = await run(
		2,
		{
			operation: 'search',
			query: 'q',
			num: 3,
			returnFormat: 'markdown',
			outputMode: 'allItems',
			additionalFields: { fetch_page_content: true },
		},
		[{ url: 'a' }],
	);
	assert.equal(r.calls[0].body.search, 'q');
	assert.equal(r.calls[0].body.fetch_page_content, true);
	assert.ok(r.out[0].json.results);
	r = await run(
		2,
		{
			operation: 'links',
			url: 'https://a.com',
			outputMode: 'splitItems',
			additionalFields: { whitelist: '/docs/', depth: 2 },
		},
		[{ url: 'a' }],
	);
	assert.equal(r.calls[0].url, '/links');
	assert.deepEqual(r.calls[0].body.whitelist, ['/docs/']);
	assert.equal(r.calls[0].body.depth, 2);
	r = await run(2, { operation: 'credits' }, { data: { credits: 1 } });
	assert.equal(r.calls[0].method, 'GET');
	assert.equal(r.calls[0].url, '/data/credits');
});
