/**
 * Structured event types emitted by the preview WebView.
 * The thin PreviewWebView component parses raw postMessage data
 * into these events and forwards them to the parent via callback.
 */

export type PreviewWebViewEvent =
  | { type: 'ready' }
  | { type: 'page_info'; hasContent: boolean; rootChildren: number; forceReady?: boolean }
  | { type: 'preview_error'; message: string }
  | { type: 'build_error'; message: string }
  | { type: 'runtime_error'; message: string }
  | { type: 'js_error'; message: string }
  | { type: 'navigation_state'; canGoBack: boolean; canGoForward: boolean; url: string }
  | { type: 'element_selected'; element: SelectedElementPayload }
  | { type: 'trigger_refresh' };

export interface SelectedElementPayload {
  tag: string;
  id?: string;
  className?: string;
  text?: string;
  innerHTML?: string;
}

/**
 * Parse a raw postMessage string from the WebView into a structured event.
 * Returns null for unparseable or unknown messages.
 */
export function parseWebViewMessage(rawData: string): PreviewWebViewEvent | null {
  try {
    const data = JSON.parse(rawData);
    if (!data || typeof data.type !== 'string') return null;

    switch (data.type) {
      case 'WEBVIEW_READY':
        return { type: 'ready' };

      case 'PAGE_INFO':
        return {
          type: 'page_info',
          hasContent: !!data.hasContent,
          rootChildren: data.rootChildren ?? 0,
          forceReady: !!data.forceReady,
        };

      case 'PREVIEW_ERROR':
        return { type: 'preview_error', message: data.message || '' };

      case 'BUILD_ERROR':
        return { type: 'build_error', message: data.message || '' };

      case 'JS_ERROR':
      case 'RUNTIME_ENV_ERROR':
        return { type: data.type === 'JS_ERROR' ? 'js_error' : 'runtime_error', message: data.message || '' };

      case 'ELEMENT_SELECTED':
        return {
          type: 'element_selected',
          element: {
            tag: data.element?.tag,
            id: data.element?.id,
            className: typeof data.element?.className === 'string'
              ? data.element.className
              : (data.element?.className?.baseVal || ''),
            text: data.element?.text,
            innerHTML: data.element?.innerHTML,
          },
        };

      case 'TRIGGER_REFRESH':
        return { type: 'trigger_refresh' };

      default:
        return null;
    }
  } catch {
    return null;
  }
}
