import { describe, expect, it } from 'vitest';
import { getSettingsScreenMode } from '../../features/settings/settingsScreenModes';

describe('getSettingsScreenMode', () => {
  it('returns plans when plan selection is active', () => {
    expect(getSettingsScreenMode({ showPlanSelection: true, showResourceUsage: false })).toBe('plans');
  });

  it('returns resource usage when only resource usage is active', () => {
    expect(getSettingsScreenMode({ showPlanSelection: false, showResourceUsage: true })).toBe('resource_usage');
  });

  it('falls back to main when no heavy view is active', () => {
    expect(getSettingsScreenMode({ showPlanSelection: false, showResourceUsage: false })).toBe('main');
  });
});
