export type SettingsScreenMode = 'main' | 'plans' | 'resource_usage';

export const getSettingsScreenMode = ({
  showPlanSelection,
  showResourceUsage,
}: {
  showPlanSelection: boolean;
  showResourceUsage: boolean;
}): SettingsScreenMode => {
  if (showPlanSelection) return 'plans';
  if (showResourceUsage) return 'resource_usage';
  return 'main';
};
