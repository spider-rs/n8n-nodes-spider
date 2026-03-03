import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SpiderApi implements ICredentialType {
	name = 'spiderApi';

	displayName = 'Spider API';

	icon = 'file:spider.svg' as const;

	documentationUrl = 'https://spider.cloud/docs/api';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Get your API key at https://spider.cloud/api-keys',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			baseURL: 'https://api.spider.cloud',
			url: '/data/credits',
			json: true,
		},
	};
}
