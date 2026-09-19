import type { HttpMethod } from '@httpreq/shared';

export const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export const methodColor: Record<HttpMethod, string> = {
  GET: 'teal',
  POST: 'blue',
  PUT: 'yellow',
  PATCH: 'orange',
  DELETE: 'red',
};

/** The single tab panel that shows the active request; every request tab controls it. */
export const REQUEST_PANEL_ID = 'request-panel';
export const requestTabId = (id: string) => `request-tab-${id}`;
