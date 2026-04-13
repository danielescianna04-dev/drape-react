import { useCallback, useEffect, useState } from 'react';
import { getAuthHeaders } from '../../core/api/getAuthToken';
import { config } from '../../config/config';

export const useChatBudget = (
  userId: string | undefined,
  isPaidUser: boolean,
  agentStreaming: boolean,
) => {
  const [budgetInfo, setBudgetInfo] = useState<{ spentEur: number; budgetEur: number; percent: number } | null>(null);

  const fetchBudget = useCallback(async () => {
    if (!userId || isPaidUser) return;
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/ai/budget/${userId}`, { headers });
      if (!response.ok) return;

      const data = await response.json();
      if (!data.success) return;

      setBudgetInfo({
        spentEur: data.usage.spentEur,
        budgetEur: data.plan.monthlyBudgetEur,
        percent: data.usage.percentUsed,
      });
    } catch {
      // best effort only
    }
  }, [isPaidUser, userId]);

  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  useEffect(() => {
    if (!agentStreaming) fetchBudget();
  }, [agentStreaming, fetchBudget]);

  return {
    budgetInfo,
    fetchBudget,
  };
};
