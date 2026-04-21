import type {
  IAuthenticateGeneric,
  Icon,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class CrawlbaseApi implements ICredentialType {
  name = 'crawlbaseApi';

  displayName = 'Crawlbase API';

  icon: Icon = {
    light: 'file:../icons/crawlbase.svg',
    dark: 'file:../icons/crawlbase.dark.svg',
  };

  documentationUrl = 'https://crawlbase.com/docs/crawling-api';

  properties: INodeProperties[] = [
    {
      displayName: 'API Token',
      name: 'token',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Your Crawlbase API token from the dashboard',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      qs: {
        token: '={{$credentials.token}}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: 'https://api.crawlbase.com',
      url: '/',
      method: 'GET',
      qs: {
        url: '',
      },
    },
  };
}
