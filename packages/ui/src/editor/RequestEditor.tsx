import { Badge, Tabs } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useMemo, type Ref } from 'react';
import {
  authProviders,
  findHeaderConflicts,
  resolveEffectiveAuth,
  resolveInheritedAuth,
} from '@httpreq/api-client';
import type { HttpMethod, HttpRequest, KeyValueItem } from '@httpreq/shared';
import { getAncestors, paramsFromUrl, urlWithParams } from '@httpreq/workspace';
import { AuthorizationPanel } from '../auth/AuthorizationPanel';
import { downloadJson, exportCollection, exportRequest, fileNameFor } from '../exchange';
import { activeEnvironment, editableRequest, useWorkbenchStore, type EditorTab } from '../store';
import { BodyPanel } from './BodyPanel';
import { Breadcrumb } from './Breadcrumb';
import { KeyValueTable } from './KeyValueTable';
import { OverviewPanel } from './OverviewPanel';
import { ScriptsPanel } from './ScriptsPanel';
import { SettingsPanel } from './SettingsPanel';
import { SharingPanel } from './SharingPanel';
import { UrlBar, type SaveState } from './UrlBar';
import classes from './RequestEditor.module.css';

const COMMON_HEADERS = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Content-Type',
  'Cookie',
  'If-Match',
  'If-None-Match',
  'Origin',
  'Referer',
  'User-Agent',
  'X-API-Key',
  'X-Correlation-ID',
  'X-Request-ID',
] as const;

const countEnabled = (items: KeyValueItem[]) =>
  items.filter((item) => item.enabled && item.key.trim() !== '').length;

interface Props {
  requestId: string;
  desktop: boolean;
  sending: boolean;
  onSend: () => void;
  onCancel: () => void;
  onSave: () => void;
  urlRef: Ref<HTMLInputElement>;
  /** Builds the cURL command for the request as currently edited. */
  buildCurl: (request: HttpRequest) => Promise<string>;
  shortcuts: { send?: string; save?: string; focusUrl?: string };
}

function Count({ value }: { value: number }) {
  return value > 0 ? (
    <span className={classes.count} aria-label={`${value} enabled`}>
      {value}
    </span>
  ) : null;
}

export function RequestEditor({
  requestId,
  desktop,
  sending,
  onSend,
  onCancel,
  onSave,
  urlRef,
  buildCurl,
  shortcuts,
}: Props) {
  const request = useWorkbenchStore((state) => editableRequest(state, requestId));
  const workspace = useWorkbenchStore((state) => state.workspace);
  const dirty = useWorkbenchStore((state) => !!state.drafts[requestId]);
  const saveStatus = useWorkbenchStore((state) => state.saveStatus[requestId]);
  const tab = useWorkbenchStore((state) => state.editorTabs[requestId] ?? 'params');
  const lastRun = useWorkbenchStore((state) =>
    state.history.find((entry) => entry.requestId === requestId),
  );
  const editRequest = useWorkbenchStore((state) => state.editRequest);
  const setEditorTab = useWorkbenchStore((state) => state.setEditorTab);
  const renameNode = useWorkbenchStore((state) => state.renameNode);
  const revealNode = useWorkbenchStore((state) => state.revealNode);
  const duplicateNode = useWorkbenchStore((state) => state.duplicateNode);

  const onChange = useCallback(
    (patch: Partial<HttpRequest>) => editRequest(requestId, patch),
    [editRequest, requestId],
  );

  const path = useMemo(() => getAncestors(workspace, requestId), [workspace, requestId]);
  const effectiveAuth = useMemo(
    () => (request ? resolveEffectiveAuth(workspace, request) : null),
    [workspace, request],
  );
  const inheritedAuth = useMemo(
    () => resolveInheritedAuth(workspace, request?.parentId ?? null),
    [workspace, request?.parentId],
  );
  const conflicts = useMemo(
    () => (request && effectiveAuth ? findHeaderConflicts(request, effectiveAuth) : []),
    [request, effectiveAuth],
  );

  const copyCurl = useCallback(async () => {
    if (!request) return;
    try {
      await navigator.clipboard.writeText(await buildCurl(request));
      notifications.show({ color: 'teal', message: 'cURL command copied to the clipboard.' });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Cannot build cURL',
        message: (error as Error).message,
      });
    }
  }, [buildCurl, request]);

  if (!request || !effectiveAuth) return null;

  const saveState: SaveState = saveStatus ?? (dirty ? 'modified' : 'saved');
  const paramCount = countEnabled(request.params);
  const headerCount = countEnabled(request.headers);
  const collection = path[0]?.kind === 'collection' ? path[0].node : undefined;
  const conflictSet = new Set(conflicts.map((name) => name.toLowerCase()));
  const environment = activeEnvironment(workspace);

  return (
    <div className={classes.editorRoot}>
      <Breadcrumb
        path={path}
        name={request.name}
        onSelect={revealNode}
        onRename={(name) => renameNode(requestId, name)}
      />
      <UrlBar
        method={request.method}
        url={request.url}
        onMethodChange={(method: HttpMethod) => onChange({ method })}
        onUrlChange={(url) => onChange({ url, params: paramsFromUrl(url, request.params) })}
        urlRef={urlRef}
        sending={sending}
        onSend={onSend}
        onCancel={onCancel}
        saveState={saveState}
        onSave={onSave}
        onCopyCurl={() => void copyCurl()}
        onDuplicate={() => duplicateNode(requestId)}
        sendShortcut={shortcuts.send}
        saveShortcut={shortcuts.save}
        focusShortcut={shortcuts.focusUrl}
      />

      <Tabs
        value={tab}
        onChange={(value) => value && setEditorTab(requestId, value as EditorTab)}
        className={`request-config ${classes.tabs}`}
        activateTabWithKeyboard
      >
        <Tabs.List className={classes.tabList} aria-label="Request editor">
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="params">
            Params <Count value={paramCount} />
          </Tabs.Tab>
          <Tabs.Tab value="body">
            Body{' '}
            {request.body.mode !== 'none' && <span className={classes.dot} aria-label="has body" />}
          </Tabs.Tab>
          <Tabs.Tab value="headers">
            Headers <Count value={headerCount} />
          </Tabs.Tab>
          <Tabs.Tab value="authorization">
            Authorization{' '}
            {request.auth.type !== 'none' && request.auth.type !== 'inherit' && (
              <span className={classes.dot} aria-label="configured" />
            )}
          </Tabs.Tab>
          <Tabs.Tab value="scripts">
            Scripts{' '}
            <Badge size="xs" variant="light" color="gray" ml={2}>
              Soon
            </Badge>
          </Tabs.Tab>
          <Tabs.Tab value="sharing">Sharing</Tabs.Tab>
          <Tabs.Tab value="settings">Settings</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" className={classes.panel}>
          <OverviewPanel
            request={request}
            location={path.length ? path.map((item) => item.node.name).join(' / ') : 'Drafts'}
            environmentName={environment?.name ?? null}
            effectiveAuth={effectiveAuth}
            lastRun={lastRun}
            paramCount={paramCount}
            headerCount={headerCount}
            onChange={onChange}
          />
        </Tabs.Panel>
        <Tabs.Panel value="params" className={classes.panel}>
          <KeyValueTable
            label="Query parameters"
            items={request.params}
            onChange={(params) => onChange({ params, url: urlWithParams(request.url, params) })}
          />
        </Tabs.Panel>
        <Tabs.Panel value="body" className={`${classes.panel} ${classes.fillPanel}`}>
          <BodyPanel request={request} onChange={onChange} />
        </Tabs.Panel>
        <Tabs.Panel value="headers" className={classes.panel}>
          <KeyValueTable
            label="Headers"
            items={request.headers}
            onChange={(headers) => onChange({ headers })}
            keySuggestions={COMMON_HEADERS}
            allowSecret
            rowNote={(item) =>
              item.enabled && conflictSet.has(item.key.trim().toLowerCase())
                ? `Replaced by the ${authProviders[effectiveAuth.auth.type].label} authorization, so it is not sent twice.`
                : undefined
            }
          />
        </Tabs.Panel>
        <Tabs.Panel value="authorization" className={classes.panel}>
          <AuthorizationPanel
            auth={request.auth}
            onChange={(auth) => onChange({ auth })}
            inherited={inheritedAuth}
            canInherit
            owner="request"
            conflicts={conflicts}
            onShowSource={revealNode}
          />
        </Tabs.Panel>
        <Tabs.Panel value="scripts" className={`${classes.panel} ${classes.fillPanel}`}>
          <ScriptsPanel request={request} onChange={onChange} />
        </Tabs.Panel>
        <Tabs.Panel value="sharing" className={classes.panel}>
          <SharingPanel
            buildCurl={() => buildCurl(request)}
            onExportRequest={() =>
              downloadJson(fileNameFor(request.name, 'request'), exportRequest(workspace, request))
            }
            onExportCollection={
              collection
                ? () => {
                    const data = exportCollection(workspace, collection.id);
                    if (data) downloadJson(fileNameFor(collection.name, 'collection'), data);
                  }
                : undefined
            }
            collectionName={collection?.name}
          />
        </Tabs.Panel>
        <Tabs.Panel value="settings" className={classes.panel}>
          <SettingsPanel request={request} onChange={onChange} desktop={desktop} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
