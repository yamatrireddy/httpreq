import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserHttpRuntime, ElectronHttpRuntime } from '@httpreq/api-client';
import { LocalWorkspaceRepository } from '@httpreq/storage';
import { HttpReqApp, httpReqTheme } from '@httpreq/ui';

const runtime = window.httpreq ? new ElectronHttpRuntime() : new BrowserHttpRuntime();
const repository = new LocalWorkspaceRepository();
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorSchemeScript defaultColorScheme="auto" />
    <MantineProvider theme={httpReqTheme} defaultColorScheme="auto">
      <Notifications position="bottom-right" />
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <HttpReqApp
            runtime={runtime}
            repository={repository}
            desktop={window.httpreq?.desktop}
            version={__APP_VERSION__}
          />
        </HashRouter>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
