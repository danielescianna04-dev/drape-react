import { describe, expect, it } from 'vitest';
import { resolveOverlayCloseScreen } from '../../app/appOverlayRouting';

describe('resolveOverlayCloseScreen', () => {
  it('returns previous screen when available', () => {
    expect(resolveOverlayCloseScreen('terminal', 'home')).toBe('terminal');
  });

  it('falls back when previous screen is missing', () => {
    expect(resolveOverlayCloseScreen(null, 'home')).toBe('home');
    expect(resolveOverlayCloseScreen(undefined, 'terminal')).toBe('terminal');
  });
});
