#!/usr/bin/env node
/**
 * Seeds the official Drape skills into Firestore (`skills_public`).
 * Idempotent — re-run anytime; install/like counters are preserved.
 *
 * Usage (from /opt/drape-backend-dev or similar):
 *   set -a && . ./.env && set +a && node scripts/seed-skills.js
 *
 * Loads service-account-key.json from the backend-ts root (sibling of dist/).
 */

const path = require('path');
const admin = require('firebase-admin');

const serviceAccountPath = path.join(__dirname, '..', 'service-account-key.json');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
  } catch (e) {
    console.error('Could not init Firebase admin:', e.message);
    process.exit(1);
  }
}

// Lazy-load the compiled service from dist/. Then explicitly initialize
// the singleton firebaseService so its internal `db` field is non-null
// (skills.service reads via `firebaseService.getFirestore()` which doesn't
// auto-initialize).
let upsertOfficial;
try {
  ({ upsertOfficial } = require('../dist/services/skills.service'));
  const { firebaseService } = require('../dist/services/firebase.service');
  firebaseService.initialize();
} catch (e) {
  console.error('Could not load dist/services/skills.service. Did you build first?');
  console.error(e.message);
  process.exit(1);
}

const SKILLS = [
  {
    id: 'drape-landing-page',
    slash: 'landing-page',
    name: 'Landing page',
    description: 'Costruisci una landing page ad alta conversione con hero, social proof, pricing, CTA.',
    category: 'build',
    tags: ['landing', 'marketing', 'conversion'],
    body: `You are building a high-conversion marketing landing page.

Required sections, in this order, unless the user explicitly asks otherwise:
1. **Hero** — single-line value prop, supporting subhead, primary CTA, secondary text-link
2. **Social proof bar** — logos or "trusted by N users" stat
3. **3 feature blocks** — each with icon, short heading, 1-2 line copy
4. **Use-case showcase** — screenshots/mockups of the product in action
5. **Testimonials** — 1-3 short quotes with name + role
6. **Pricing** — clean cards, one highlighted "recommended" tier
7. **FAQ** — 4-6 collapsible items
8. **Final CTA** — bigger, bolder repeat of the hero CTA
9. **Footer** — links + copyright

Design rules:
- One accent color, used sparingly. Default body to dark text on near-white background unless user requests dark mode.
- Use concrete, specific copy. NEVER write "Lorem ipsum" or generic "Discover the power of..." — invent realistic copy that fits the user's product.
- Hero CTA must be a single verb action ("Start free", "Get the demo", "Try it now") — not "Learn more".
- Include at least one numeric proof point (users / hours saved / % improvement / rating).
- Use semantic HTML. Set page <title> and meta description.

After building, suggest 1 improvement the user could make next.`,
    examples: [{ prompt: '/landing-page Negozio di fiori a domicilio a Milano' }],
  },
  {
    id: 'drape-saas-dashboard',
    slash: 'saas-dashboard',
    name: 'SaaS dashboard',
    description: 'Dashboard amministrativa completa: sidebar, KPI, tabella, drawer di dettaglio.',
    category: 'build',
    tags: ['dashboard', 'admin', 'crud', 'saas'],
    body: `You are building an admin/analytics dashboard for a SaaS-style product.

Required structure:
- **Persistent sidebar** (left): logo, primary navigation (4-6 links), user menu at bottom
- **Top bar**: page title, search, notifications icon, user avatar
- **Main area**:
  - 4 KPI tiles in a row (e.g. MRR, active users, churn, conversion) — each with current value, delta vs last period, sparkline
  - 1 chart card (line or area, last 30d) below the KPIs
  - 1 data table below the chart — sortable columns, row hover, click opens a side drawer with details

Design rules:
- Use a clear visual hierarchy: KPIs first, chart second, table last.
- Numeric values bold and large; secondary labels muted and small.
- Use exactly one accent color for active states + primary actions; everything else neutral.
- Empty states for the table must include a CTA, not just "No data".
- Make the sidebar collapsible on mobile.
- Use semantic table HTML (<thead>, <tbody>) and proper aria labels.

Mock data should look real (varied numbers, plausible names, realistic dates) so the dashboard feels alive even with seed data.`,
    examples: [{ prompt: '/saas-dashboard Per una piattaforma di e-learning' }],
  },
  {
    id: 'drape-redesign',
    slash: 'redesign',
    name: 'Redesign distintivo',
    description: 'Trasforma una UI generica in qualcosa di esteticamente forte, con tipografia scelta e composizione audace.',
    category: 'design',
    tags: ['design', 'ui', 'aesthetic', 'typography'],
    body: `You are redesigning an existing UI to elevate it from generic to memorable. Avoid AI-generated aesthetics.

Process:
1. **Pick a clear aesthetic direction** before touching code: brutally minimal / maximalist / editorial / retro-futurist / luxury / playful — commit to ONE.
2. **Typography**: choose distinctive fonts. NEVER use Inter, Roboto, Arial, system-ui as the primary face. Pair a display font with a refined body font.
3. **Color**: dominant palette with sharp accents. Avoid the cliché "purple gradient on white". Commit to a theme (deep dark, off-white editorial, warm earth, cold tech, etc).
4. **Spatial composition**: use unexpected layouts. Asymmetry. Generous negative space OR controlled density. Grid-breaking when intentional.
5. **Atmosphere**: don't default to flat solid backgrounds. Add gradient meshes, noise, geometric patterns, layered transparencies, dramatic shadows.
6. **Motion**: one well-orchestrated page-load reveal beats scattered micro-interactions. Use staggered animation-delay.

Anti-patterns to avoid:
- Generic "modern SaaS" rounded card stacks on white
- Three feature columns with circle icons
- Big purple gradient hero
- Inter font everywhere

Match implementation complexity to the aesthetic vision: maximalist needs elaborate code; minimalist needs precision and restraint.

After redesigning, summarize the design choices in 3-5 bullets so the user understands the direction.`,
    examples: [{ prompt: '/redesign Trasforma questa landing in stile editoriale magazine' }],
  },
  {
    id: 'drape-seo',
    slash: 'seo',
    name: 'SEO essenziale',
    description: 'Aggiungi meta tag, Open Graph, sitemap, robots, structured data e fixes Lighthouse base.',
    category: 'ops',
    tags: ['seo', 'meta', 'open-graph', 'sitemap'],
    body: `You are adding production-grade SEO to a web project.

Required tasks (do them in this order, skip what's already done):
1. **Meta tags in <head>**: title (≤60 chars), description (≤160 chars), canonical URL, language, viewport, theme-color
2. **Open Graph + Twitter Card**: og:title, og:description, og:image (1200×630), og:type, og:url, twitter:card="summary_large_image"
3. **Favicons**: at least apple-touch-icon (180×180) and a maskable PWA icon
4. **robots.txt**: allow all, point to sitemap
5. **sitemap.xml**: list all routes (or generate dynamically if framework supports it)
6. **Structured data (JSON-LD)**: at minimum WebSite + Organization. Add Product / Article / FAQ where applicable.
7. **Performance hints**: preconnect to external font/image origins, lazy-load images below the fold, set explicit width/height on <img> to avoid CLS.
8. **Semantic HTML**: ensure h1 is unique per page, headings are hierarchical, alt text on every <img>.

Generate realistic placeholder text that the user can later customize — don't leave "TODO" markers.

After applying, list which routes are now indexed in sitemap.xml and which still need attention.`,
    examples: [{ prompt: '/seo Setup completo per il mio sito Next.js' }],
  },
  {
    id: 'drape-review',
    slash: 'review',
    name: 'Code review',
    description: 'Revisione critica del diff corrente: bug, side-effects, sicurezza, leggibilità.',
    category: 'review',
    tags: ['review', 'quality', 'security', 'pr'],
    body: `You are reviewing the user's current uncommitted changes (or a specific file/branch they point at).

Process:
1. **Read the diff first** via \`git diff\` (and \`git diff --cached\` for staged). If they ask about a specific file, read that file in full.
2. **Categorize findings** into:
   - 🔴 **Bugs / correctness**: things that will break (null derefs, race conditions, off-by-one, wrong types, missing await)
   - 🟠 **Security**: SQL injection, XSS, missing auth checks, leaked secrets, unsafe shell, OWASP top 10
   - 🟡 **Side-effects**: things that work but might surprise users (async fire-and-forget, mutation of shared state, breaking API contracts)
   - 🔵 **Readability / maintainability**: dead code, magic numbers, unclear names, missing types, over-abstracted code
   - 🟢 **Nits**: spacing, comments, minor style — only mention 1-2 if there's nothing more important.

Rules:
- If the diff is clean, SAY SO loudly and don't invent issues.
- Cite file paths + line numbers using \`path:line\` format.
- For each finding give: what's wrong, why it matters, suggested fix (1-3 lines of code if helpful).
- Skip "consider adding tests" unless tests are clearly absent.
- DO NOT review the entire file when only a few lines changed.

Conclude with a 1-line verdict: "ship it", "ship after fixes", or "needs significant rework".`,
    examples: [{ prompt: '/review' }],
  },
];

async function main() {
  console.log(`🌱 Seeding ${SKILLS.length} official skills into skills_public...`);
  for (const s of SKILLS) {
    try {
      await upsertOfficial(s.id, {
        slash: s.slash,
        name: s.name,
        description: s.description,
        category: s.category,
        body: s.body,
        tags: s.tags,
        examples: s.examples || [],
      });
      console.log(`  ✓ /${s.slash} — ${s.name}`);
    } catch (err) {
      console.error(`  ✗ /${s.slash} — ${err && err.message ? err.message : err}`);
    }
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
