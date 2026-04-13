const planStore = new Map<string, any>();

export function getStoredPlan(projectId: string) {
  return planStore.get(projectId) ?? null;
}

export function storePlan(projectId: string, plan: any): void {
  planStore.set(projectId, {
    ...plan,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
}

export function updateStoredPlan(projectId: string, updates: Record<string, unknown>) {
  const current = planStore.get(projectId);
  if (!current) return null;
  const next = { ...current, ...updates };
  planStore.set(projectId, next);
  return next;
}

export function clearPlan(projectId: string): void {
  planStore.delete(projectId);
}
