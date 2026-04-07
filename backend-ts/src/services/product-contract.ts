/**
 * Product Contract — single source of truth for what gets built and verified.
 *
 * The preview contract is deterministic (no AI), built from stable question IDs.
 * The architecture step may refine it (narrow only, never widen).
 * The fast gate reads it to know what to verify.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface ProductContract {
  projectName: string;
  description: string;
  technology: string;

  coreFlows: Array<{
    id: string;
    label: string;
    priority: 'primary' | 'secondary';
  }>;

  pages: Array<{
    path: string;
    role: 'home' | 'primary' | 'secondary';
    flowId?: string;
  }>;

  primaryCtas: Array<{
    id: string;
    label: string;
    page: string;
    expectedAction: 'navigate' | 'state-change' | 'submit' | 'open-modal' | 'gesture-equivalent';
    testSelector?: string;
    blocking: boolean;
  }>;

  requiredInteractions: Array<{
    id: string;
    label: string;
    type: 'gesture' | 'navigation' | 'state-change' | 'form-save' | 'selection';
    page: string;
    testSelector?: string;
    checkStrategy: 'dom-change' | 'url-change' | 'card-index-changed' | 'modal-visible' | 'form-persisted' | 'element-count';
    linkedCriterionId?: string;
    blocking: boolean;
  }>;

  acceptanceCriteria: Array<{
    id: string;
    flowId?: string;
    type: 'page-load' | 'navigation' | 'state-change' | 'form-save' | 'gesture';
    page: string;
    successSignal: string;
    checkStrategy: 'url-change' | 'dom-change' | 'modal-visible' | 'element-count' | 'form-persisted' | 'card-index-changed' | 'content-visible';
    blocking: boolean;
  }>;

  excludedFeatures: string[];
  assumptions: string[];
  dataMode: 'mock' | 'mixed' | 'real';

  featureBudget: {
    maxPages: number;
    maxComponents: number;
  };
}

// ── Stable Question/Option IDs ─────────────────────────────────────

export interface QuestionSchema {
  questionId: string;
  question: string;
  multiSelect: boolean;
  options: Array<{ optionId: string; label: string }>;
}

// ── Answer shape from frontend ─────────────────────────────────────

export interface StructuredAnswers {
  core_flows?: string[];      // optionIds: ["discover", "matches", "profile"]
  key_interaction?: string;   // optionId: "swipe_or_buttons"
  data_mode?: string;         // optionId: "mock_no_login"
  visual_style?: string;      // optionId: "dark_bold"
}

// ── Flow/CTA inference maps ────────────────────────────────────────

const FLOW_DEFINITIONS: Record<string, { label: string; priority: 'primary' | 'secondary'; page: string; ctas: Array<{ id: string; label: string; action: 'state-change' | 'navigate' | 'submit'; }>; }> = {
  discover: { label: 'Discover / Explore', priority: 'primary', page: '/discover', ctas: [{ id: 'like-btn', label: 'Like / Heart', action: 'state-change' }, { id: 'skip-btn', label: 'Skip / Nope', action: 'state-change' }] },
  matches: { label: 'Matches / Favorites', priority: 'primary', page: '/matches', ctas: [{ id: 'match-open', label: 'Open match detail', action: 'navigate' }] },
  chat: { label: 'Chat / Messages', priority: 'secondary', page: '/chat', ctas: [{ id: 'send-msg', label: 'Send message', action: 'submit' }] },
  profile: { label: 'Profile / Settings', priority: 'secondary', page: '/profile', ctas: [{ id: 'save-profile', label: 'Save profile', action: 'submit' }] },
  feed: { label: 'Feed / Timeline', priority: 'primary', page: '/feed', ctas: [{ id: 'post-action', label: 'Like / Comment', action: 'state-change' }] },
  search: { label: 'Search / Browse', priority: 'primary', page: '/search', ctas: [{ id: 'search-submit', label: 'Search', action: 'submit' }] },
  cart: { label: 'Cart / Checkout', priority: 'primary', page: '/cart', ctas: [{ id: 'checkout-btn', label: 'Checkout', action: 'navigate' }] },
  products: { label: 'Products / Catalog', priority: 'primary', page: '/products', ctas: [{ id: 'add-to-cart', label: 'Add to cart', action: 'state-change' }] },
  dashboard: { label: 'Dashboard / Overview', priority: 'primary', page: '/dashboard', ctas: [] },
  settings: { label: 'Settings', priority: 'secondary', page: '/settings', ctas: [{ id: 'save-settings', label: 'Save settings', action: 'submit' }] },
  auth: { label: 'Login / Register', priority: 'secondary', page: '/auth', ctas: [{ id: 'login-btn', label: 'Login', action: 'submit' }] },
  home: { label: 'Home / Landing', priority: 'primary', page: '/', ctas: [{ id: 'main-cta', label: 'Get started', action: 'navigate' }] },
};

const INTERACTION_MAP: Record<string, { label: string; type: 'gesture' | 'navigation' | 'state-change' | 'selection'; checkStrategy: 'dom-change' | 'card-index-changed' | 'url-change' | 'element-count'; }> = {
  swipe_or_buttons: { label: 'Swipe or like/nope interaction', type: 'gesture', checkStrategy: 'card-index-changed' },
  swipe_gesture: { label: 'Swipe gesture on cards', type: 'gesture', checkStrategy: 'card-index-changed' },
  list_browsing: { label: 'List browsing and selection', type: 'navigation', checkStrategy: 'url-change' },
  card_stack: { label: 'Card stack interaction', type: 'gesture', checkStrategy: 'dom-change' },
  form_submit: { label: 'Form submission', type: 'state-change', checkStrategy: 'dom-change' },
  drag_drop: { label: 'Drag and drop', type: 'gesture', checkStrategy: 'dom-change' },
  filter_sort: { label: 'Filter and sort', type: 'selection', checkStrategy: 'element-count' },
};

const DATA_MODE_MAP: Record<string, { dataMode: 'mock' | 'mixed' | 'real'; assumptions: string[] }> = {
  mock_no_login: { dataMode: 'mock', assumptions: ['Mock data from hardcoded arrays', 'No real authentication', 'Mock photos from Unsplash'] },
  mock_with_login: { dataMode: 'mock', assumptions: ['Mock data', 'Fake login flow (no real auth)'] },
  real_db_auth: { dataMode: 'real', assumptions: ['Real database', 'Real authentication'] },
};

const DEFAULT_EXCLUDED = ['Video call', 'Real-time notifications', 'Premium/payments', 'Push notifications', 'File upload', 'Stories/reels'];

// ── Builder ────────────────────────────────────────────────────────

export function buildPreviewContract(
  projectName: string,
  description: string,
  technology: string,
  answers: StructuredAnswers,
): ProductContract {
  // Core flows from answers, or infer a single "home" flow
  const flowIds = answers.core_flows?.length ? answers.core_flows : ['home'];
  const coreFlows = flowIds
    .filter(id => FLOW_DEFINITIONS[id])
    .slice(0, 3)
    .map(id => ({
      id,
      label: FLOW_DEFINITIONS[id].label,
      priority: FLOW_DEFINITIONS[id].priority,
    }));

  // If no recognized flows, add a generic home flow
  if (coreFlows.length === 0) {
    coreFlows.push({ id: 'home', label: 'Home / Landing', priority: 'primary' });
  }

  // Pages: home + 1 per flow
  const pages: ProductContract['pages'] = [{ path: '/', role: 'home' }];
  for (const flow of coreFlows) {
    const def = FLOW_DEFINITIONS[flow.id];
    if (def && def.page !== '/') {
      pages.push({ path: def.page, role: flow.priority === 'primary' ? 'primary' : 'secondary', flowId: flow.id });
    }
  }

  // Primary CTAs from flow definitions
  const primaryCtas: ProductContract['primaryCtas'] = [];
  for (const flow of coreFlows) {
    const def = FLOW_DEFINITIONS[flow.id];
    if (!def) continue;
    for (const cta of def.ctas) {
      primaryCtas.push({
        id: cta.id,
        label: cta.label,
        page: def.page,
        expectedAction: cta.action,
        testSelector: cta.id,
        blocking: flow.priority === 'primary',
      });
    }
  }

  // Required interaction from key_interaction answer
  const interactionKey = answers.key_interaction || 'list_browsing';
  const interactionDef = INTERACTION_MAP[interactionKey] || INTERACTION_MAP['list_browsing'];
  const primaryFlowPage = coreFlows.find(f => f.priority === 'primary');
  const interactionPage = primaryFlowPage ? (FLOW_DEFINITIONS[primaryFlowPage.id]?.page || '/') : '/';

  const requiredInteractions: ProductContract['requiredInteractions'] = [{
    id: 'main-interaction',
    label: interactionDef.label,
    type: interactionDef.type,
    page: interactionPage,
    testSelector: 'main-interaction',
    checkStrategy: interactionDef.checkStrategy,
    linkedCriterionId: 'main-interaction-works',
    blocking: true,
  }];

  // Acceptance criteria: 1 per flow (page loads) + 1 for main interaction outcome
  const acceptanceCriteria: ProductContract['acceptanceCriteria'] = [];
  for (const flow of coreFlows) {
    const def = FLOW_DEFINITIONS[flow.id];
    acceptanceCriteria.push({
      id: `${flow.id}-loads`,
      flowId: flow.id,
      type: 'page-load',
      page: def?.page || '/',
      successSignal: `${flow.label} page loads with content and styled UI`,
      checkStrategy: 'content-visible',
      blocking: flow.priority === 'primary',
    });
  }
  acceptanceCriteria.push({
    id: 'main-interaction-works',
    flowId: primaryFlowPage?.id,
    type: 'state-change',
    page: interactionPage,
    successSignal: `Main interaction produces visible change (${interactionDef.label})`,
    checkStrategy: interactionDef.checkStrategy,
    blocking: true,
  });

  // Data mode + assumptions
  const dataConfig = DATA_MODE_MAP[answers.data_mode || 'mock_no_login'] || DATA_MODE_MAP['mock_no_login'];

  return {
    projectName,
    description,
    technology,
    coreFlows,
    pages: pages.slice(0, 5),
    primaryCtas: primaryCtas.slice(0, 6),
    requiredInteractions,
    acceptanceCriteria,
    excludedFeatures: DEFAULT_EXCLUDED,
    assumptions: dataConfig.assumptions,
    dataMode: dataConfig.dataMode,
    featureBudget: { maxPages: Math.min(pages.length, 5), maxComponents: 6 },
  };
}

// ── Contract to prompt constraint text ─────────────────────────────

export function contractToPromptConstraint(contract: ProductContract): string {
  const lines: string[] = [];
  lines.push('PRODUCT CONTRACT — YOU MUST FOLLOW THIS EXACTLY:');
  lines.push('');
  lines.push('Core flows (implement these end-to-end):');
  for (const f of contract.coreFlows) {
    lines.push(`- [${f.priority}] ${f.label}`);
  }
  lines.push('');
  lines.push('Pages to create (ONLY these, no more):');
  for (const p of contract.pages) {
    lines.push(`- ${p.path} (${p.role})`);
  }
  lines.push('');
  lines.push(`Feature budget: max ${contract.featureBudget.maxPages} pages, max ${contract.featureBudget.maxComponents} components`);
  lines.push('');
  lines.push('Primary CTAs that MUST have real working handlers:');
  for (const c of contract.primaryCtas) {
    lines.push(`- "${c.label}" on ${c.page} → ${c.expectedAction}${c.testSelector ? ` (add data-testid="${c.testSelector}")` : ''}`);
  }
  lines.push('');
  lines.push('Required interactions:');
  for (const i of contract.requiredInteractions) {
    lines.push(`- ${i.label} (${i.type}) on ${i.page}${i.testSelector ? ` (add data-testid="${i.testSelector}")` : ''}`);
  }
  lines.push('');
  lines.push(`DO NOT CREATE any of these excluded features: ${contract.excludedFeatures.join(', ')}`);
  lines.push(`Data mode: ${contract.dataMode}`);
  lines.push(`Assumptions: ${contract.assumptions.join(', ')}`);
  lines.push('');
  lines.push('Do NOT create pages, routes, CTAs, or features outside this contract.');
  lines.push('Do NOT create dynamic routes like [id] unless concrete instances are navigable from the UI.');
  return lines.join('\n');
}

// ── Contract to summary text (for UI) ──────────────────────────────

export function contractToSummary(contract: ProductContract): {
  coreFlows: string[];
  interactions: string[];
  excluded: string[];
  assumptions: string[];
} {
  return {
    coreFlows: contract.coreFlows.map(f => f.label),
    interactions: contract.requiredInteractions.map(i => i.label),
    excluded: contract.excludedFeatures.slice(0, 5),
    assumptions: contract.assumptions,
  };
}
