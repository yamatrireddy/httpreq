// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isAllowedExternalUrl,
  isTitleBarTheme,
  isTrustedRendererUrl,
  nextZoomLevel,
  MAX_ZOOM_LEVEL,
} from './shell';

describe('desktop shell IPC validation', () => {
  it('only opens the project documentation externally', () => {
    expect(isAllowedExternalUrl('https://github.com/yamatrireddy/httpreq')).toBe(true);
    expect(
      isAllowedExternalUrl('https://github.com/yamatrireddy/httpreq/blob/main/README.md'),
    ).toBe(true);
    expect(isAllowedExternalUrl('https://github.com/yamatrireddy/httpreq-evil')).toBe(false);
    expect(isAllowedExternalUrl('http://github.com/yamatrireddy/httpreq')).toBe(false);
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedExternalUrl(42)).toBe(false);
  });

  it('accepts only #rrggbb title bar colours', () => {
    expect(isTitleBarTheme({ color: '#141414', symbolColor: '#C9C9C9' })).toBe(true);
    expect(isTitleBarTheme({ color: 'red', symbolColor: '#ffffff' })).toBe(false);
    expect(isTitleBarTheme(null)).toBe(false);
  });

  it('trusts only the app renderer origin', () => {
    expect(isTrustedRendererUrl('file:///app/index.html', undefined)).toBe(true);
    expect(isTrustedRendererUrl('https://evil.example', undefined)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost:5173/#/', 'http://localhost:5173')).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:9999/', 'http://localhost:5173')).toBe(false);
  });

  it('clamps zoom steps', () => {
    expect(nextZoomLevel(0, 'in')).toBe(0.5);
    expect(nextZoomLevel(MAX_ZOOM_LEVEL, 'in')).toBe(MAX_ZOOM_LEVEL);
    expect(nextZoomLevel(2, 'reset')).toBe(0);
  });
});
