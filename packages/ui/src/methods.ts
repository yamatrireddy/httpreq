import type { HttpMethod, TreeNodeKind } from '@httpreq/shared';

export const methodColor: Record<HttpMethod, string> = {
  GET: 'teal',
  POST: 'blue',
  PUT: 'yellow',
  PATCH: 'orange',
  DELETE: 'red',
  HEAD: 'grape',
  OPTIONS: 'gray',
};

/** WebSocket requests are labelled with one badge colour, as HTTP verbs are. */
export const WEBSOCKET_COLOR = 'violet';

/** Tree nodes that open in a tab rather than containing other nodes. */
export const isLeafRow = (kind: TreeNodeKind) => kind === 'request' || kind === 'websocket';

/** The single tab panel that shows the active request; every request tab controls it. */
export const REQUEST_PANEL_ID = 'request-panel';
export const requestTabId = (id: string) => `request-tab-${id}`;
