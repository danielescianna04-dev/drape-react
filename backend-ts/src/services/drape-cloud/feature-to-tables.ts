/**
 * Baseline data-model inference from user-provided creation input.
 *
 * Reads the `.drape/creation-input.json` (description + structuredAnswers)
 * and derives a list of candidate Drape Cloud tables the generated app
 * should probably have. Emits a `DataModelPlan` the pipeline persists
 * as `.drape/data-model.md` so the generation AI starts with a concrete
 * schema instead of reasoning from a blank slate.
 *
 * This is step G of the full plan — purely deterministic, no LLM call.
 * The AI can still extend/shrink the plan at runtime via the
 * `declare_tables` tool (step F).
 *
 * Kept as a pure function: given `(description, structuredAnswers)`
 * we always return the same plan. Makes the step trivially testable
 * and keeps the failure mode small — a bad plan is a typo in this
 * file, not a flaky remote call.
 */

export type TableScope = 'shared' | 'mine' | 'junction';

export interface PlannedTable {
  name: string;
  scope: TableScope;
  purpose: string;
  /** true when the table should be seeded with realistic rows at creation. */
  seedable: boolean;
}

export interface DataModelPlan {
  tables: PlannedTable[];
  /** Raw keyword matches so the prompt can reference what triggered each table. */
  matches: Array<{ keyword: string; source: 'description' | 'answers'; tables: string[] }>;
  /** True when at least one table is `mine` — auth UI becomes mandatory. */
  requiresAuth: boolean;
}

type Rule = {
  keywords: string[];
  tables: PlannedTable[];
};

/**
 * Keyword → tables rules. Kept intentionally flat + readable so it's
 * easy to audit which user signals produce which tables.
 *
 * Rules are evaluated in order against both `description` (natural
 * language) and the values of `structuredAnswers` (option ids like
 * "shopping_cart", "wishlist_page"). A table is added to the plan
 * the first time a matching rule fires — later duplicates are merged.
 */
const RULES: Rule[] = [
  // E-commerce / catalog
  {
    keywords: ['cart', 'carrello', 'checkout', 'shopping', 'acquista', 'buy now'],
    tables: [
      { name: 'cart_items', scope: 'mine', purpose: 'Items the current user has added to their cart', seedable: false },
      { name: 'orders', scope: 'mine', purpose: 'Confirmed orders placed by the current user', seedable: false },
    ],
  },
  {
    keywords: ['product', 'prodott', 'catalogo', 'catalog', 'store', 'negozio', 'shop', 'e-commerce', 'ecommerce', 'marketplace'],
    tables: [
      { name: 'products', scope: 'shared', purpose: 'Catalog of items for sale — shown to everyone', seedable: true },
    ],
  },
  {
    keywords: ['categoria', 'categories', 'category', 'collezion', 'collection'],
    tables: [
      { name: 'categories', scope: 'shared', purpose: 'Category taxonomy for catalog filtering', seedable: true },
    ],
  },
  {
    keywords: ['wishlist', 'lista desideri', 'preferit', 'favori', 'saved', 'salvati', 'bookmark', 'segnalibr'],
    tables: [
      { name: 'wishlist_items', scope: 'mine', purpose: 'Items the current user has saved for later', seedable: false },
    ],
  },
  {
    keywords: ['review', 'recension', 'rating', 'valutazion', 'feedback', 'stelle', 'stars'],
    tables: [
      { name: 'reviews', scope: 'shared', purpose: 'User-submitted reviews visible to everyone', seedable: true },
    ],
  },
  {
    keywords: ['coupon', 'promo code', 'codice sconto', 'discount code'],
    tables: [
      { name: 'coupons', scope: 'shared', purpose: 'Promotional codes available at checkout', seedable: true },
    ],
  },

  // Social / content
  {
    keywords: ['post', 'feed', 'timeline', 'status update', 'bacheca', 'articolo', 'article', 'blog', 'news'],
    tables: [
      { name: 'posts', scope: 'shared', purpose: 'Public posts / articles visible to everyone', seedable: true },
    ],
  },
  {
    keywords: ['comment', 'comment', 'commenti', 'reply', 'rispost'],
    tables: [
      { name: 'comments', scope: 'shared', purpose: 'Comments attached to posts / items — author-attributed', seedable: true },
    ],
  },
  {
    keywords: ['like', 'mi piace', 'heart', 'clap', 'applaus', 'upvote', 'like button'],
    tables: [
      { name: 'likes', scope: 'junction', purpose: 'user_id × post_id — tracks which user liked which post', seedable: false },
    ],
  },
  {
    keywords: ['follow', 'seguire', 'seguit', 'subscribe', 'friend'],
    tables: [
      { name: 'follows', scope: 'junction', purpose: 'follower_id × followed_id for the social graph', seedable: false },
    ],
  },
  {
    keywords: ['chat', 'message', 'messaggi', 'dm', 'direct message', 'inbox'],
    tables: [
      { name: 'conversations', scope: 'mine', purpose: 'Direct conversations the current user participates in', seedable: false },
      { name: 'messages', scope: 'mine', purpose: 'Individual messages within a conversation', seedable: false },
    ],
  },
  {
    keywords: ['notif', 'notifica', 'notification', 'alert'],
    tables: [
      { name: 'notifications', scope: 'mine', purpose: 'Per-user activity notifications', seedable: false },
    ],
  },
  {
    keywords: ['storia', 'story', 'stories', 'reel', 'short'],
    tables: [
      { name: 'stories', scope: 'shared', purpose: 'Short-lived media items visible on the feed', seedable: true },
    ],
  },

  // Productivity
  {
    keywords: ['task', 'todo', 'to-do', 'attività', 'activity list', 'checklist', 'compit'],
    tables: [
      { name: 'tasks', scope: 'mine', purpose: 'Tasks the current user is tracking', seedable: false },
    ],
  },
  {
    keywords: ['project', 'progett', 'workspace'],
    tables: [
      { name: 'projects', scope: 'mine', purpose: 'Workspaces / projects owned by the current user', seedable: false },
    ],
  },
  {
    keywords: ['tag', 'etichett', 'label', 'categoria'],
    tables: [
      { name: 'tags', scope: 'mine', purpose: 'User-defined tags for organising items', seedable: false },
    ],
  },
  {
    keywords: ['note', 'nota', 'appunt', 'memo', 'scratch'],
    tables: [
      { name: 'notes', scope: 'mine', purpose: 'Personal notes / memos', seedable: false },
    ],
  },
  {
    keywords: ['calendar', 'calendario', 'schedule', 'appuntament', 'event', 'booking', 'prenotazion'],
    tables: [
      { name: 'events', scope: 'shared', purpose: 'Events / sessions that users can view and book', seedable: true },
      { name: 'bookings', scope: 'mine', purpose: 'Bookings / reservations made by the current user', seedable: false },
    ],
  },

  // Fitness / health / wellness
  {
    keywords: ['workout', 'allenament', 'exercise', 'esercizi', 'fitness', 'gym', 'palestra'],
    tables: [
      { name: 'workouts', scope: 'shared', purpose: 'Workout templates / routines available to everyone', seedable: true },
      { name: 'workout_logs', scope: 'mine', purpose: 'Each user\'s completed workout sessions', seedable: false },
    ],
  },
  {
    keywords: ['meal', 'food', 'cibo', 'pasto', 'recipe', 'ricett', 'nutrition', 'nutrizion', 'diet'],
    tables: [
      { name: 'recipes', scope: 'shared', purpose: 'Recipes / meal templates visible to everyone', seedable: true },
      { name: 'meal_logs', scope: 'mine', purpose: 'Meals the current user has logged', seedable: false },
    ],
  },
  {
    keywords: ['habit', 'abitudin', 'streak', 'daily'],
    tables: [
      { name: 'habits', scope: 'mine', purpose: 'Habits the current user is tracking', seedable: false },
      { name: 'habit_logs', scope: 'mine', purpose: 'Daily completions / check-ins per habit', seedable: false },
    ],
  },
  {
    keywords: ['mood', 'umore', 'journal', 'diari', 'mindful', 'meditaz'],
    tables: [
      { name: 'journal_entries', scope: 'mine', purpose: 'Private journal entries', seedable: false },
    ],
  },

  // Media / entertainment
  {
    keywords: ['movie', 'film', 'cinema', 'pellicol'],
    tables: [
      { name: 'movies', scope: 'shared', purpose: 'Catalog of films', seedable: true },
      { name: 'watchlist', scope: 'mine', purpose: 'Movies the current user plans to watch', seedable: false },
    ],
  },
  {
    keywords: ['song', 'track', 'brano', 'music', 'musica', 'album', 'playlist'],
    tables: [
      { name: 'tracks', scope: 'shared', purpose: 'Catalog of songs / tracks', seedable: true },
      { name: 'playlists', scope: 'mine', purpose: 'User-created playlists', seedable: false },
    ],
  },
  {
    keywords: ['book', 'libro', 'ebook', 'reading'],
    tables: [
      { name: 'books', scope: 'shared', purpose: 'Catalog of books', seedable: true },
      { name: 'reading_list', scope: 'mine', purpose: 'Books the current user is reading or plans to read', seedable: false },
    ],
  },
  {
    keywords: ['podcast', 'episode', 'episodi'],
    tables: [
      { name: 'podcasts', scope: 'shared', purpose: 'Catalog of podcasts', seedable: true },
      { name: 'episodes', scope: 'shared', purpose: 'Individual podcast episodes', seedable: true },
    ],
  },
  {
    keywords: ['game', 'giocc', 'gioc', 'score', 'punteggi', 'leaderboard', 'classifica'],
    tables: [
      { name: 'games', scope: 'shared', purpose: 'Catalog of games / challenges', seedable: true },
      { name: 'scores', scope: 'mine', purpose: 'Scores / results the user achieved', seedable: false },
    ],
  },

  // Travel / location
  {
    keywords: ['hotel', 'alberg', 'room', 'stanze', 'stay'],
    tables: [
      { name: 'hotels', scope: 'shared', purpose: 'Catalog of hotels / properties', seedable: true },
    ],
  },
  {
    keywords: ['restaurant', 'ristorant', 'pizzeria', 'dining'],
    tables: [
      { name: 'restaurants', scope: 'shared', purpose: 'Catalog of restaurants', seedable: true },
    ],
  },
  {
    keywords: ['trip', 'viaggio', 'itinerary', 'itinerari', 'destination'],
    tables: [
      { name: 'trips', scope: 'mine', purpose: 'Trips / itineraries the user has planned', seedable: false },
    ],
  },

  // Profile / settings (implied, low priority — only if mentioned)
  {
    keywords: ['profile', 'profilo', 'bio', 'avatar', 'preferenze', 'settings', 'impostazioni'],
    tables: [
      { name: 'profiles', scope: 'mine', purpose: 'Extended user profile info beyond the auth record', seedable: false },
    ],
  },

  // Generic CMS / content
  {
    keywords: ['article', 'articol', 'tutorial', 'guide', 'guida', 'learn'],
    tables: [
      { name: 'articles', scope: 'shared', purpose: 'Tutorials / articles visible to everyone', seedable: true },
    ],
  },
];

function normalize(text: string): string {
  return text.toLowerCase();
}

function tokens(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

/**
 * Build the data-model baseline from the user's input.
 * Pure function: no IO.
 */
export function inferDataModel(opts: {
  description?: string | null;
  structuredAnswers?: Record<string, unknown> | null;
}): DataModelPlan {
  const haystackText = normalize(opts.description || '');

  const haystackAnswers: string[] = [];
  if (opts.structuredAnswers) {
    for (const val of Object.values(opts.structuredAnswers)) {
      for (const tok of tokens(val)) haystackAnswers.push(normalize(tok));
    }
  }
  const haystackAll = haystackAnswers.concat(haystackText);

  const byName = new Map<string, PlannedTable>();
  const matches: DataModelPlan['matches'] = [];

  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      const inDescription = haystackText.includes(kw);
      const inAnswers = haystackAnswers.some((a) => a.includes(kw));
      if (!inDescription && !inAnswers) continue;

      const addedThisMatch: string[] = [];
      for (const t of rule.tables) {
        if (!byName.has(t.name)) {
          byName.set(t.name, { ...t });
          addedThisMatch.push(t.name);
        }
      }
      if (addedThisMatch.length > 0) {
        matches.push({
          keyword: kw,
          source: inAnswers ? 'answers' : 'description',
          tables: addedThisMatch,
        });
      }
      // First keyword in this rule that fires wins — avoid duplicate matches.
      break;
    }
    // Don't suppress iteration over unmatched haystack strings — we still
    // loop all rules so every keyword group has a chance.
    void haystackAll;
  }

  const tables = Array.from(byName.values());
  // Stable sort: shared → mine → junction, alphabetical within each scope.
  const order: Record<TableScope, number> = { shared: 0, mine: 1, junction: 2 };
  tables.sort((a, b) => order[a.scope] - order[b.scope] || a.name.localeCompare(b.name));

  return {
    tables,
    matches,
    requiresAuth: tables.some((t) => t.scope === 'mine' || t.scope === 'junction'),
  };
}

const LLM_SYSTEM_PROMPT = `You are a database planner for a Drape Cloud project. Given a user's app description and their questionnaire answers, return ONLY the tables the app actually needs — no more, no less.

Scope rules (pick exactly one per table):
- "shared": catalog/content visible to everyone (products, articles, tracks, posts)
- "mine": rows owned by the signed-in user (cart_items, orders, goals, bookmarks)
- "junction": link between two tables (user_products, post_tags)

Seedable:
- true for "shared" catalog tables where 8-15 realistic rows help the app look alive at first render
- false for "mine" / "junction" tables (created at runtime by user actions)

Output STRICT JSON: {"tables":[{"name":"snake_case","scope":"shared|mine|junction","purpose":"short english sentence","seedable":true|false}]}

Rules:
- Only include tables that are central to a feature the user explicitly mentioned. Do NOT add speculative tables ("news", "strategies") just because a keyword appeared in passing.
- If unsure whether a feature needs persistence, DO NOT declare a table. The AI can add one later via the declare_tables tool.
- Keep names short, snake_case, plural (products, orders, tags).
- Max 8 tables. Prefer fewer.
- If the app is static/informational and needs no persistence, return {"tables":[]}.`;

function buildLlmPlannerInput(opts: {
  description?: string | null;
  structuredAnswers?: Record<string, unknown> | null;
}): string {
  const parts: string[] = [];
  if (opts.description) parts.push(`Description:\n${opts.description.trim().substring(0, 1500)}`);
  if (opts.structuredAnswers && Object.keys(opts.structuredAnswers).length > 0) {
    parts.push(`Structured answers:\n${JSON.stringify(opts.structuredAnswers).substring(0, 1500)}`);
  }
  return parts.join('\n\n') || '(no description provided)';
}

const SAFE_TABLE_NAME_RE = /^[a-z_][a-z0-9_]{0,63}$/;

function sanitizePlannedTables(raw: unknown): PlannedTable[] {
  if (!Array.isArray(raw)) return [];
  const byName = new Map<string, PlannedTable>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim().toLowerCase() : '';
    if (!SAFE_TABLE_NAME_RE.test(name)) continue;
    const scope = r.scope;
    if (scope !== 'shared' && scope !== 'mine' && scope !== 'junction') continue;
    const purpose = typeof r.purpose === 'string' ? r.purpose.trim().substring(0, 200) : '';
    const seedable = r.seedable === true;
    if (byName.has(name)) continue;
    byName.set(name, { name, scope, purpose, seedable: seedable && scope === 'shared' });
  }
  return Array.from(byName.values()).slice(0, 8);
}

/**
 * LLM-backed planner. Uses a cheap model to decide which tables are really
 * needed instead of firing every matching keyword rule. Falls back to the
 * deterministic `inferDataModel` on any failure (parse error, model timeout,
 * empty output).
 */
export async function inferDataModelWithLLM(opts: {
  description?: string | null;
  structuredAnswers?: Record<string, unknown> | null;
}): Promise<DataModelPlan> {
  const fallback = () => inferDataModel(opts);
  try {
    const { aiProviderService } = await import('../ai-provider.service');
    const userMsg = buildLlmPlannerInput(opts);
    const raw = await aiProviderService.chatSimple(
      [{ role: 'user', content: userMsg }],
      LLM_SYSTEM_PROMPT,
    );
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback();
    const parsed = JSON.parse(jsonMatch[0]);
    const tables = sanitizePlannedTables(parsed?.tables);
    if (tables.length === 0) {
      // Empty result from LLM is a valid outcome (static app), but fall back
      // when the description clearly implies persistence and the keyword
      // baseline has something to suggest.
      const baseline = fallback();
      return baseline.tables.length > 0 ? baseline : { tables: [], matches: [], requiresAuth: false };
    }
    const order: Record<TableScope, number> = { shared: 0, mine: 1, junction: 2 };
    tables.sort((a, b) => order[a.scope] - order[b.scope] || a.name.localeCompare(b.name));
    return {
      tables,
      matches: [],
      requiresAuth: tables.some((t) => t.scope === 'mine' || t.scope === 'junction'),
    };
  } catch {
    return fallback();
  }
}

/**
 * Render a human-readable markdown document from the plan. Persisted
 * as `.drape/data-model.md` so the generation AI finds it as an
 * existing file in the workspace (much stronger signal than a prompt
 * rule — the model tends to respect files it can read).
 */
export function renderDataModelMarkdown(plan: DataModelPlan, opts: { projectTitle?: string } = {}): string {
  const lines: string[] = [];
  lines.push(`# Data model — ${opts.projectTitle || 'Drape Cloud project'}`);
  lines.push('');
  lines.push('This file is the CANONICAL list of tables for this app. It was');
  lines.push('computed from the user\'s description + questionnaire answers by');
  lines.push('the Drape Cloud planner BEFORE code generation started.');
  lines.push('');
  lines.push('- Implement every table listed below. Do not reuse one table across');
  lines.push('  unrelated concepts. If you need an extra table, call the');
  lines.push('  `declare_tables` tool FIRST — do not just start writing a file');
  lines.push('  that uses a table name not listed here.');
  lines.push('');

  if (plan.tables.length === 0) {
    lines.push('> _No baseline tables inferred. Analyse the description yourself,');
    lines.push('> call `declare_tables` with at least one table before writing any_');
    lines.push('> _component that persists data._');
    lines.push('');
  } else {
    lines.push('## Tables');
    lines.push('');
    lines.push('| Name | Scope | Purpose | Seed? |');
    lines.push('|---|---|---|---|');
    for (const t of plan.tables) {
      const seed = t.seedable ? '✅ 8–15 rows in cloud-seed.json' : '❌ runtime only';
      lines.push(`| \`${t.name}\` | ${t.scope} | ${t.purpose} | ${seed} |`);
    }
    lines.push('');
  }

  if (plan.requiresAuth) {
    lines.push('## Auth is REQUIRED for this app');
    lines.push('');
    lines.push('At least one table is user-scoped (`mine` / junction). The user');
    lines.push('will lose their data across devices unless they can sign in.');
    lines.push('You MUST build BOTH:');
    lines.push('- a `/signup` route with an email + password form calling `drape.auth.signUp(email, password)`');
    lines.push('- a `/login` route calling `drape.auth.signIn(email, password)`');
    lines.push('- a navbar slot that shows `drape.auth.user()?.email` when signed in, or a "Login" link when anonymous');
    lines.push('- on `DrapeError`, map `.code` to a friendly message:');
    lines.push('  - `email_taken` → "Email already registered"');
    lines.push('  - `invalid_credentials` → "Invalid email or password"');
    lines.push('  - `weak_password` → "Password must be at least 8 characters"');
    lines.push('');
  }

  if (plan.matches.length > 0) {
    lines.push('## Why these tables');
    lines.push('');
    for (const m of plan.matches) {
      lines.push(`- Found "${m.keyword}" in ${m.source} → added: ${m.tables.map((t) => `\`${t}\``).join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Convert the plan into an empty cloud-seed.json skeleton. Shared +
 * seedable tables get an empty array the AI is expected to populate.
 * `mine`/junction tables are NOT listed (they'd be dropped by the
 * seed parser anyway since the rule "no empty arrays" applies).
 */
export function renderSeedSkeleton(plan: DataModelPlan): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const t of plan.tables) {
    if (t.scope === 'shared' && t.seedable) out[t.name] = [];
  }
  return out;
}
