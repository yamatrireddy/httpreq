import { DOCUMENTATION_URL } from '@httpreq/shared';

/** Height of the custom title bar; the native window-controls overlay must match it. */
export const TITLE_BAR_HEIGHT = 36;

export const MIN_ZOOM_LEVEL = -3;
export const MAX_ZOOM_LEVEL = 5;
export const ZOOM_STEP = 0.5;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR.test(value);

export const isTitleBarTheme = (
  value: unknown,
): value is { color: string; symbolColor: string } => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return isHexColor(candidate.color) && isHexColor(candidate.symbolColor);
};

/** Only the project's own documentation may be opened in the system browser. */
export const isAllowedExternalUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const allowed = new URL(DOCUMENTATION_URL);
  return (
    url.protocol === 'https:' &&
    url.host === allowed.host &&
    (url.pathname === allowed.pathname || url.pathname.startsWith(`${allowed.pathname}/`))
  );
};

export const nextZoomLevel = (current: number, direction: 'in' | 'out' | 'reset'): number => {
  if (direction === 'reset') return 0;
  const next = current + (direction === 'in' ? ZOOM_STEP : -ZOOM_STEP);
  return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, next));
};

/**
 * Accepts IPC only from the app's own top-level document: the Vite dev server in development or
 * the packaged `file://` renderer in production. Subframes and navigated-away pages are rejected.
 */
export const isTrustedRendererUrl = (url: string | undefined, devServer: string | undefined) => {
  if (!url) return false;
  if (devServer) {
    try {
      return new URL(url).origin === new URL(devServer).origin;
    } catch {
      return false;
    }
  }
  return url.startsWith('file://');
};
