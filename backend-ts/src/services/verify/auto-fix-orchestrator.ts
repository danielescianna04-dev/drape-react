/**
 * Auto-fix cycle: given a failed VerifyResult, gather broken files + screenshots,
 * call an LLM to produce a JSON patch list, and apply it.
 *
 * Two model tiers:
 * - cheap path (PROJECT_FIX_MODEL) — used up to 3 verify attempts
 * - escalation path (PROJECT_FIX_ESCALATION_MODEL) — single attempt, budget-capped
 *
 * Protected config files are never overwritten even if the model returns them.
 */

import { log } from '../../utils/logger';
import { workspaceService } from '../workspace.service';
import { fileService } from '../file.service';
import { aiProviderService, StreamChunk, UsageInfo } from '../ai-provider.service';
import { shellEscape } from '../../utils/helpers';
import { mergeBuildReportSummary } from '../build-report.service';
import { config } from '../../config';
import { ProjectAICostSummary } from '../project-ai-policy';
import { assessProjectComplexity, ProjectComplexity } from '../project-complexity.service';
import { PROTECTED_CONFIG_FILES } from '../../utils/protected-files';
import type { AutoFixOptions, AutoFixResult, VerifyResult } from './types';
import {
  extractBrokenControlLabels,
  extractDeadLinkHrefs,
  extractNavDestinationPaths,
  trimErrorForPrompt,
  trimFileContentForPrompt,
} from './error-classifier';
import {
  getKeyFilesForTechnology,
  normalizeTechnology,
  readCreationInputIntent,
  readCreationInputTechnology,
  type ProjectTechnology,
} from '../project-technology';

const PROJECT_FIX_MAX_CONTEXT_FILES = config.projectVerifyFixMaxContextFiles;
const PROJECT_FIX_ESCALATION_MAX_CONTEXT_FILES = config.projectVerifyEscalationMaxContextFiles;
const MAX_FIX_PROMPT_ERRORS = 6;
const MAX_FIX_SCREENSHOTS = 2;

export function calculateStreamCostEur(model: string, usage: UsageInfo): number {
  const modelConfig = aiProviderService.getModelConfig(model);
  if (!modelConfig) return 0;
  const inputCost = ((usage.inputTokens || 0) / 1_000_000) * modelConfig.costPerMInputToken;
  const outputCost = ((usage.outputTokens || 0) / 1_000_000) * modelConfig.costPerMOutputToken;
  return (inputCost + outputCost) * 0.92;
}

export async function readProjectAICostSummary(projectId: string): Promise<ProjectAICostSummary> {
  try {
    const read = await fileService.readFile(projectId, '.drape/build-report.json');
    if (!read.success || !read.data?.content) {
      return { generationCostEur: 0, verifyCostEur: 0, verifyEscalationCostEur: 0, totalCostEur: 0 };
    }
    const report = JSON.parse(read.data.content);
    const summary = report?.summary || {};
    return {
      generationCostEur: Number(summary.aiGenerationCostEur || 0),
      verifyCostEur: Number(summary.aiVerifyCostEur || 0),
      verifyEscalationCostEur: Number(summary.aiVerifyEscalationCostEur || 0),
      totalCostEur: Number(summary.aiTotalCostEur || 0),
    };
  } catch {
    return { generationCostEur: 0, verifyCostEur: 0, verifyEscalationCostEur: 0, totalCostEur: 0 };
  }
}

export async function readProjectComplexity(
  projectId: string,
  technology: string,
): Promise<{ level: ProjectComplexity; score: number }> {
  try {
    const read = await fileService.readFile(projectId, '.drape/build-report.json');
    if (!read.success || !read.data?.content) {
      return { level: 'medium', score: 0 };
    }
    const report = JSON.parse(read.data.content);
    const summary = report?.summary || {};
    if (
      typeof summary.projectComplexity === 'string' &&
      ['simple', 'medium', 'complex'].includes(summary.projectComplexity)
    ) {
      return {
        level: summary.projectComplexity as ProjectComplexity,
        score: Number(summary.projectComplexityScore || 0),
      };
    }

    const assessment = assessProjectComplexity({
      technology,
      description: typeof summary.creationPrompt === 'string' ? summary.creationPrompt : '',
      answers: summary.creationAnswers && typeof summary.creationAnswers === 'object'
        ? summary.creationAnswers
        : {},
      cloudMode: Boolean(report?.cloudMode),
    });
    await mergeBuildReportSummary(projectId, {
      projectComplexity: assessment.level,
      projectComplexityScore: assessment.score,
    }).catch(() => {});
    return { level: assessment.level, score: assessment.score };
  } catch {
    return { level: 'medium', score: 0 };
  }
}

export async function autoFix(
  projectId: string,
  userId: string,
  technology: string,
  result: VerifyResult,
  options: AutoFixOptions,
): Promise<AutoFixResult> {
  const fixStartTime = Date.now();
  try {
    let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 };
    const maxContextFiles = options.escalated
      ? PROJECT_FIX_ESCALATION_MAX_CONTEXT_FILES
      : PROJECT_FIX_MAX_CONTEXT_FILES;
    const maxScreenshots = options.escalated ? MAX_FIX_SCREENSHOTS : 1;
    const fileReadCache = new Map<string, string>();

    const readProjectFile = async (relPath: string): Promise<string> => {
      if (fileReadCache.has(relPath)) return fileReadCache.get(relPath) || '';
      const readResult = await workspaceService.exec(
        projectId,
        userId,
        `cat ${shellEscape(`/home/coder/project/${relPath}`)} 2>/dev/null`,
      );
      const content = readResult.stdout || '';
      fileReadCache.set(relPath, content);
      return content;
    };

    const canAddMoreContext = (files: { path: string; content: string }[]) => files.length < maxContextFiles;
    const pushContextFile = (files: { path: string; content: string }[], path: string, content: string) => {
      if (!content || !content.trim()) return;
      if (!canAddMoreContext(files)) return;
      if (PROTECTED_CONFIG_FILES.has(path) || files.some((file) => file.path === path)) return;
      files.push({ path, content: trimFileContentForPrompt(content) });
    };

    // Read broken files for AI context
    const brokenFiles: { path: string; content: string }[] = [];
    const summarizedErrors = [...new Set(result.errors.map(trimErrorForPrompt))].slice(0, MAX_FIX_PROMPT_ERRORS);

    for (const err of summarizedErrors) {
      if (!canAddMoreContext(brokenFiles)) break;
      const fileMatch = err.match(/(?:\/home\/coder\/project\/|\.\/)?([a-zA-Z0-9_\-/.]+\.(?:tsx?|jsx?|vue|svelte|astro|css))/);
      if (fileMatch) {
        const relPath = fileMatch[1].replace(/^\/home\/coder\/project\//, '');
        if (PROTECTED_CONFIG_FILES.has(relPath)) continue;
        try {
          pushContextFile(brokenFiles, relPath, await readProjectFile(relPath));
        } catch {}
      }
    }

    // Resolve the project's actual technology so we read (and ask the model
    // to modify) the files the runtime actually serves. The old code always
    // loaded app/page.tsx + src/App.tsx — wrong for vanilla-HTML projects
    // where the runtime serves index.html and ignores any React file.
    const resolvedTechnology: ProjectTechnology =
      (await readCreationInputTechnology(projectId)) ||
      normalizeTechnology(technology) ||
      'nextjs';
    for (const p of getKeyFilesForTechnology(resolvedTechnology)) {
      if (!canAddMoreContext(brokenFiles)) break;
      try {
        pushContextFile(brokenFiles, p, await readProjectFile(p));
      } catch {}
    }

    // For 404 errors: extract the missing route and read related files
    for (const err of summarizedErrors) {
      if (!canAddMoreContext(brokenFiles)) break;
      const routeMatch = err.match(/\[\/([^\]]+)\]/);
      if (routeMatch) {
        const route = routeMatch[1];
        if (!/^[a-zA-Z0-9_/-]+$/.test(route)) continue;
        for (const ext of ['tsx', 'jsx', 'ts', 'js']) {
          if (!canAddMoreContext(brokenFiles)) break;
          try {
            const relPath = `app/${route}/page.${ext}`;
            pushContextFile(brokenFiles, relPath, await readProjectFile(relPath));
          } catch {}
        }
      }
    }

    // For navigation errors, dead clicks, route failures, OR module resolution errors:
    // read all pages + state. Module errors rarely have file paths in them, so we
    // need to load everything to give the AI enough context.
    const hasNavErrors = result.errors.some(e => e.includes('[nav]'));
    const hasDeadClicks = result.errors.some(e => e.includes('Dead interactive element'));

    // Dead-link targets: pull [href=/x] out of dead-click errors so we can
    // (a) load the real target page into context if it exists, or
    // (b) tell the prompt the route is missing and must be created.
    // This is the key missing signal — without it the AI often "fixes" the
    // source page and leaves the missing destination page untouched, making
    // the next verify attempt fail with the identical error cluster.
    const deadLinkTargets: { href: string; page: string; exists: boolean }[] = [];
    if (hasDeadClicks) {
      for (const href of extractDeadLinkHrefs(result.errors)) {
        const route = href.replace(/^\//, '').replace(/\/$/, '');
        const candidates = [
          `app/${route}/page.tsx`,
          `app/${route}/page.jsx`,
          `src/app/${route}/page.tsx`,
          `src/app/${route}/page.jsx`,
          `src/pages/${route}.tsx`,
          `src/pages/${route}.jsx`,
          `src/pages/${route}/index.tsx`,
          `src/pages/${route}/index.jsx`,
        ];
        let foundPath: string | null = null;
        for (const cand of candidates) {
          try {
            const content = await readProjectFile(cand);
            if (content && content.trim()) {
              foundPath = cand;
              if (canAddMoreContext(brokenFiles)) pushContextFile(brokenFiles, cand, content);
              break;
            }
          } catch {}
        }
        if (foundPath) {
          deadLinkTargets.push({ href, page: foundPath, exists: true });
        } else {
          deadLinkTargets.push({ href, page: candidates[0], exists: false });
        }
      }
    }

    // Broken-control labels: when qa-agent reports a button/link by visible
    // text (e.g. "METÀX", "Tutto"), grep the project for that literal so the
    // auto-fix loads the file that actually renders it — not just the default
    // key-files list. Without this, the AI often "fixes" the wrong component
    // repeatedly while the dead button stays broken.
    const brokenControlMatches: { label: string; files: string[] }[] = [];
    if (hasDeadClicks || hasNavErrors) {
      const labels = extractBrokenControlLabels(result.errors);
      for (const label of labels) {
        if (!canAddMoreContext(brokenFiles)) break;
        try {
          const grep = await workspaceService.exec(
            projectId,
            userId,
            `grep -rln --include='*.tsx' --include='*.jsx' --include='*.ts' --include='*.js' -F ${shellEscape(label)} /home/coder/project/app /home/coder/project/src /home/coder/project/components 2>/dev/null | head -3`,
          );
          const files: string[] = [];
          for (const line of (grep.stdout || '').split('\n').filter(Boolean)) {
            const relPath = line.replace('/home/coder/project/', '');
            if (PROTECTED_CONFIG_FILES.has(relPath)) continue;
            files.push(relPath);
            if (!canAddMoreContext(brokenFiles)) break;
            try {
              pushContextFile(brokenFiles, relPath, await readProjectFile(relPath));
            } catch {}
          }
          if (files.length > 0) brokenControlMatches.push({ label, files });
        } catch {}
      }
    }

    // Nav-error destinations: "[nav] ... → /subscriptions/4 → error screen"
    // Dynamic routes (/subscriptions/4) map to app/subscriptions/[id]/page.tsx
    // which the default key-files list misses. Probe literal AND common
    // dynamic-segment variants so the detail page that actually broke is in
    // the AI's context.
    const navDestinations: { path: string; resolvedFile: string | null }[] = [];
    if (hasDeadClicks || result.errors.some(e => e.includes('[nav]'))) {
      for (const destPath of extractNavDestinationPaths(result.errors)) {
        const segments = destPath.replace(/^\//, '').split('/');
        const candidates: string[] = [];
        // Literal path first.
        candidates.push(`app/${segments.join('/')}/page.tsx`, `app/${segments.join('/')}/page.jsx`);
        // Dynamic-segment variants: swap the LAST segment with [id]/[slug]/[...slug].
        // Pick the last segment because that's where URLs usually embed ids
        // (e.g. /subscriptions/4, /blog/post-1, /users/abc).
        if (segments.length >= 2) {
          const prefix = segments.slice(0, -1).join('/');
          for (const dyn of ['[id]', '[slug]', '[...slug]']) {
            candidates.push(`app/${prefix}/${dyn}/page.tsx`, `app/${prefix}/${dyn}/page.jsx`);
          }
        } else if (segments.length === 1) {
          for (const dyn of ['[id]', '[slug]', '[...slug]']) {
            candidates.push(`app/${dyn}/page.tsx`, `app/${dyn}/page.jsx`);
          }
        }
        // src/pages router (Vite / legacy Next.js pages router)
        if (segments.length >= 1) {
          candidates.push(
            `src/pages/${segments.join('/')}.tsx`,
            `src/pages/${segments.join('/')}.jsx`,
            `src/pages/${segments.join('/')}/index.tsx`,
          );
        }
        let resolved: string | null = null;
        for (const cand of candidates) {
          if (!canAddMoreContext(brokenFiles)) break;
          try {
            const content = await readProjectFile(cand);
            if (content && content.trim()) {
              resolved = cand;
              pushContextFile(brokenFiles, cand, content);
              break;
            }
          } catch {}
        }
        navDestinations.push({ path: destPath, resolvedFile: resolved });
      }
    }

    const hasRouteErrors = result.errors.some(e => e.match(/\[route \//));
    const hasModuleErrors = result.errors.some(e =>
      /Can't resolve|Cannot find module|Module not found|Module not resolved|next\/dist\/pages|next-flight-client-entry-loader/.test(e),
    );
    const hasRedirectErrors = result.errors.some(e => /redirect.*loop|redirect.*back to/i.test(e));

    // For redirect loops: load middleware.ts (common auth guard source) + involved pages
    if (hasRedirectErrors) {
      for (const f of ['middleware.ts', 'middleware.js']) {
        if (brokenFiles.some(bf => bf.path === f)) continue;
        try {
          const r = await workspaceService.exec(projectId, userId, `cat /home/coder/project/${f} 2>/dev/null`);
          if (r.stdout) brokenFiles.push({ path: f, content: r.stdout });
        } catch {}
      }
      // Extract page name from redirect error and load that page
      for (const err of summarizedErrors) {
        if (!canAddMoreContext(brokenFiles)) break;
        const redirectMatch = err.match(/redirect.*(?:loop|back to).*\/([\w-]+)/i);
        if (redirectMatch) {
          const page = redirectMatch[1];
          for (const p of [`app/${page}/page.tsx`, `app/${page}/page.jsx`, `app/(${page})/page.tsx`]) {
            if (!canAddMoreContext(brokenFiles)) break;
            if (brokenFiles.some(f => f.path === p)) continue;
            try {
              const content = await readProjectFile(p);
              if (content) { pushContextFile(brokenFiles, p, content); break; }
            } catch {}
          }
        }
      }
    }

    // Extract module specifiers from "Can't resolve 'X'" errors and grep-find
    // which files are importing them — those files need the fix.
    for (const err of summarizedErrors) {
      if (!canAddMoreContext(brokenFiles)) break;
      const specMatch = err.match(/Can't resolve ['"]([^'"]+)['"]|Cannot find module ['"]([^'"]+)['"]/);
      const spec = specMatch?.[1] || specMatch?.[2];
      if (!spec) continue;
      try {
        // Escape regex meta-chars in the spec for safe grep
        const safeSpec = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const grep = await workspaceService.exec(
          projectId,
          userId,
          `grep -rln --include='*.tsx' --include='*.ts' --include='*.jsx' --include='*.js' ${shellEscape(safeSpec)} /home/coder/project/app /home/coder/project/src /home/coder/project/components 2>/dev/null | head -4`,
        );
        for (const line of (grep.stdout || '').split('\n').filter(Boolean)) {
          if (!canAddMoreContext(brokenFiles)) break;
          const relPath = line.replace('/home/coder/project/', '');
          if (PROTECTED_CONFIG_FILES.has(relPath) || brokenFiles.some(f => f.path === relPath)) continue;
          try {
            pushContextFile(brokenFiles, relPath, await readProjectFile(relPath));
          } catch {}
        }
      } catch {}
    }
    // Also try to pull specific files referenced by [route /xxx] errors
    for (const err of summarizedErrors) {
      if (!canAddMoreContext(brokenFiles)) break;
      const routeMatch = err.match(/\[route (\/[a-zA-Z0-9_/-]*)\]/);
      if (routeMatch) {
        const route = routeMatch[1];
        const candidates = route === '/'
          ? ['app/page.tsx', 'app/page.jsx', 'src/pages/Index.tsx', 'src/App.tsx']
          : [`app${route}/page.tsx`, `app${route}/page.jsx`, `src/pages${route}.tsx`, `src/pages${route}/index.tsx`];
        for (const cand of candidates) {
          if (!canAddMoreContext(brokenFiles)) break;
          if (brokenFiles.some(f => f.path === cand)) continue;
          try {
            const content = await readProjectFile(cand);
            if (content) {
              pushContextFile(brokenFiles, cand, content);
              break;
            }
          } catch {}
        }
      }
    }
    if (hasNavErrors || hasDeadClicks || hasRouteErrors || hasModuleErrors) {
      // Read all page/component files to understand navigation flow + wiring
      if (canAddMoreContext(brokenFiles)) {
        try {
          const findResult = await workspaceService.exec(
            projectId,
            userId,
            'find /home/coder/project \\( -path "*/node_modules" -o -path "*/.next" \\) -prune -o \\( -name "page.tsx" -o -name "page.jsx" -o -name "App.tsx" \\) -print 2>/dev/null | head -8; find /home/coder/project/src/pages /home/coder/project/src/components 2>/dev/null -name "*.tsx" | head -6',
          );
          for (const pagePath of (findResult.stdout || '').trim().split('\n').filter(Boolean)) {
            if (!canAddMoreContext(brokenFiles)) break;
            const relPath = pagePath.replace('/home/coder/project/', '');
            if (PROTECTED_CONFIG_FILES.has(relPath) || brokenFiles.some(f => f.path === relPath)) continue;
            try {
              pushContextFile(brokenFiles, relPath, await readProjectFile(relPath));
            } catch {}
          }
        } catch {}
      }

      // Read store/context/state files — often where navigation bugs live
      const statePatterns = [
        'find /home/coder/project/app -maxdepth 3 \\( -name "store*" -o -name "context*" -o -name "provider*" -o -name "auth*" \\) 2>/dev/null | head -4',
        'find /home/coder/project/src -maxdepth 3 \\( -name "store*" -o -name "context*" -o -name "provider*" -o -name "auth*" \\) 2>/dev/null | head -4',
      ];
      for (const cmd of statePatterns) {
        if (!canAddMoreContext(brokenFiles)) break;
        try {
          const stateFiles = await workspaceService.exec(projectId, userId, cmd);
          for (const sf of (stateFiles.stdout || '').trim().split('\n').filter(Boolean)) {
            if (!canAddMoreContext(brokenFiles)) break;
            const relPath = sf.replace('/home/coder/project/', '');
            if (brokenFiles.some(f => f.path === relPath)) continue;
            try {
              pushContextFile(brokenFiles, relPath, await readProjectFile(relPath));
            } catch {}
          }
        } catch {}
      }
    }

    const fileContext = brokenFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n');
    const routeFailures = (result.pages || [])
      .filter((page) => (page.errors?.length || 0) > 0)
      .slice(0, 4)
      .map((page) => `- ${page.path}: ${(page.errors || []).map(trimErrorForPrompt).slice(0, 2).join(' | ')}`)
      .join('\n');
    const navigationFailures = (result.navigation || [])
      .filter((nav) => nav.error)
      .slice(0, 3)
      .map((nav) => `- ${nav.element?.text || 'unknown'}: ${trimErrorForPrompt(nav.error || 'navigation failed')}`)
      .join('\n');

    // Include screenshot info in prompt
    let screenshotContext = '';
    const screenshotImages: { page: string; base64: string }[] = [];
    if (result.screenshots.size > 0) {
      screenshotContext = '\n\nSCREENSHOTS OF BROKEN PAGES (what the user sees):\n';
      for (const [pagePath, base64] of result.screenshots) {
        screenshotContext += `- ${pagePath}: BROKEN — see screenshot below\n`;
        // Keep max 3 screenshots to avoid token limits
        if (screenshotImages.length < maxScreenshots) {
          screenshotImages.push({ page: pagePath, base64 });
        }
      }
      screenshotContext += '\nAnalyze the screenshots. Fix ALL visual issues: blank pages, missing CSS, wrong layout, 404 errors, missing content.\n';
    }

    const deadLinkSection = deadLinkTargets.length > 0
      ? `DEAD LINK TARGETS (parsed from [href=...] in errors):\n${deadLinkTargets
          .map((t) =>
            t.exists
              ? `- ${t.href} → target page EXISTS at ${t.page} (check why the click doesn't navigate; maybe client-side Link usage or disabled nav)`
              : `- ${t.href} → target page MISSING — CREATE ${t.page} with real visible content (heading + cards/sections), do NOT just change the link's href`,
          )
          .join('\n')}\n`
      : '';

    const navDestinationSection = navDestinations.length > 0
      ? `NAV-ERROR DESTINATIONS (pages that rendered an error/blank after click):\n${navDestinations
          .map((d) =>
            d.resolvedFile
              ? `- ${d.path} → open ${d.resolvedFile} and FIX the actual render error (likely undefined access, missing prop, or bad data lookup on the dynamic id)`
              : `- ${d.path} → no page file found; CREATE the matching page (dynamic routes use app/<segment>/[id]/page.tsx) with a safe lookup that handles missing items`,
          )
          .join('\n')}\n`
      : '';

    const brokenControlSection = brokenControlMatches.length > 0
      ? `BROKEN CONTROL LOCATIONS (grep of each broken button/link label across the project):\n${brokenControlMatches
          .map((m) =>
            `- "${m.label}" is rendered in: ${m.files.join(', ')} — open THAT file and wire the control. If the element is a child component, also edit the parent to pass a real onClick prop (never leave the prop undefined).`,
          )
          .join('\n')}\n`
      : '';

    // For blank/minimal/visual content failures the error alone doesn't tell
    // the model WHAT the user asked for — so it tends to write bland filler.
    // Surface the original creation prompt + structured answers so the fix
    // actually implements the requested feature.
    const hasContentIntentError = result.errors.some((e) =>
      /\[content\]|Page is blank|No visible content|blank page|minimal content|\[visual\]/i.test(e),
    );
    let intentSection = '';
    if (hasContentIntentError) {
      const intent = await readCreationInputIntent(projectId);
      if (intent.description || intent.structuredAnswers) {
        const answers = intent.structuredAnswers
          ? JSON.stringify(intent.structuredAnswers).slice(0, 1200)
          : '';
        intentSection = `USER'S ORIGINAL REQUEST (what this app is supposed to do — the rendered page does NOT match this yet):\n${intent.description ? intent.description.slice(0, 1200) : '(no description)'}\n${answers ? `Structured answers: ${answers}\n` : ''}Project technology: ${resolvedTechnology}. Fix the runtime-served files listed below (not unused framework files) so the app actually implements this request with real, interactive content — not a generic landing page.\n\n`;
      }
    }

    const fixPrompt = `Fix these ${resolvedTechnology} project errors:

${intentSection}ERRORS:
${summarizedErrors.join('\n')}
${screenshotContext}
${routeFailures ? `FAILING ROUTES:\n${routeFailures}\n` : ''}
${navigationFailures ? `BROKEN INTERACTIONS:\n${navigationFailures}\n` : ''}
${deadLinkSection}${navDestinationSection}${brokenControlSection}${fileContext ? `CURRENT FILES:\n${fileContext}\n` : ''}
Return a JSON array of fixed files: [{"path": "file/path", "content": "complete fixed content"}]

Rules:
- Return COMPLETE file content, not just changed lines
- DO NOT modify these files: ${[...PROTECTED_CONFIG_FILES].join(', ')}
- For 404 errors: CREATE the missing page file with real content (not redirect)
- For redirect errors: REPLACE redirect() with actual page content
- For 'use client' errors: add 'use client' at top of file
- For missing module: add the correct import
- For blank page: ensure components return visible JSX with Tailwind classes
- For "[visual]" errors: Gemini Vision spotted a layout/design issue (wrong alignment, broken grid, overlapping text, missing CSS, distorted images, inaccessible contrast). The description names the page and the issue. Open that page file and its CSS/layout, and fix the root cause — not only the symptom. If the issue mentions a missing element ("no heading", "no CTA", "empty section") add it with real content and Tailwind classes.
- For "Page is blank" / "No visible content": the route renders but the viewport is effectively empty. Fix the actual route file and any component it renders so there is guaranteed visible above-the-fold content on first load:
  • render a real heading, body copy, and at least one visible card/list/grid/button section
  • if data arrays are empty or undefined, provide hardcoded fallback mock items instead of returning null/[]
  • never return null, an empty fragment, or a wrapper that only contains absolutely positioned/transparent elements
  • ensure the page container has visible text colors and spacing ("min-h-screen", padding, headings, cards)
  • if navigation points to /discover (or another route), make that route itself visibly render content without waiting for interaction
  • if a page composes child sections, inspect those child components too and inline a simple fallback section if they render nothing
- Use lucide-react for icons (it's installed in the template)
- All data must be hardcoded const arrays — NEVER use fetch() for mock data
- For "Dead interactive element" / "nothing happened" errors: the button/link has no working handler. RULE: every visible clickable element MUST do something visible when tapped. Fixes:
  • Empty or missing onClick → add a real handler: useState toggle, router.push(), open modal via state, show toast, filter/sort state update
  • Link to nonexistent route → PREFER creating the destination page file (app/<route>/page.tsx) with real visible content over silently changing the href. Only change the href if another real route already exists and makes sense
  • Placeholder href ("[href=#]", "[href=none]", "[href=]") → this is a stub link; wire it to a real route (creating it if needed) or replace with a button + onClick
  • Card/div with cursor-pointer → add onClick that navigates or opens details
  • Icon button (heart/star/share/bell) → toggle local state, show toast, or open a panel
  • Tab/nav item → use router.push() or setActiveTab state
  • PARENT/CHILD: if the broken control lives in a child component (e.g. <TopBar />, <BottomNav />, <FilterChip />), the fix is TWO files: (1) the child accepts an onClick/onPress prop and forwards it to the underlying button; (2) the parent page passes a real handler to that prop. Fixing only the child (with a no-op default) or only the parent (without exposing the prop) leaves the button dead — verify will flag the same label again on the next attempt.
  • LABEL GREP: if a "BROKEN CONTROL LOCATIONS" section above lists files where the label appears, start there — that's the component that renders the dead button. Do not modify unrelated files that happen to be in the default key-files list.
  NEVER leave onClick={() => {}} or onClick={()=>console.log()} — if you can't wire it, REMOVE the element from JSX entirely
- The error message format is: "Dead interactive element: <type> \"<text>\" [href=<target>] on page <path> — ..." — the href bracket tells you the exact link target. If a "DEAD LINK TARGETS" section is included above, follow it literally: when it says "target page MISSING — CREATE <path>", your fix MUST include a new file at that exact path with real content (do NOT just tweak the source page). When it says "target page EXISTS", fix whatever in that page prevents the click from doing something visible.
- For redirect loops (page X redirects to page Y): the guard/redirect logic doesn't persist state. Fix by using localStorage or cookies to persist auth/profile state across navigations, not just React state
- For "[route /xxx] HTTP 500" or "[route /xxx] Module not found": a sub-route page is broken. Common fix: the relative import path is wrong. If app/page.tsx uses './components/ui/button' (works from root), app/contatti/page.tsx needs '../components/ui/button' (go up one level) OR use the absolute alias '@/components/ui/button'. PREFER absolute imports with @/ for all pages — never mix relative paths across directory depths.
- For "FiCalendar is not defined" or any icon ReferenceError: the JSX uses a react-icons component that isn't in the import statement. Add it to the import: import { FiArrowRight, FiCalendar, ... } from 'react-icons/fi'
- For "Can't resolve '@/lib/store'" or similar missing user module: EITHER create the missing file (e.g., lib/store.ts with a proper zustand/context store) OR remove the import and inline the state with useState. Pick the simpler option.
- For import alias errors like "@/lib/data" or "@/components/ui/button": this is user code, not corrupted dependencies. Fix tsconfig/alias usage only if needed, but usually the right fix is to create the missing file or update the importing file to use a real existing module.
- For "Can't resolve 'next/dist/pages/_app'" or any 'next/dist/pages/*' import: this is PAGES ROUTER syntax in an APP ROUTER project. REMOVE the import entirely. App router has no _app.tsx — use app/layout.tsx instead. If user code imports App from next/dist/pages/_app, delete that line and replace it with whatever the code actually needs from app/layout.tsx.
- For "Can't resolve 'next-flight-client-entry-loader'" or similar next.js internal loader errors: the project has a corrupt .next cache or invalid webpack config. The fix is NOT in user code — trust the backend to handle it via cache clear. DO NOT modify next.config.ts or webpack config. Instead, check if any user file imports from 'next/dist/build' or 'next/dist/compiled' — remove those imports.
- For 'use client' errors or "React hook used in server component": add 'use client' at the top of the file (line 1, before all imports).
- For hydration errors ("Hydration failed", "server rendered HTML didn't match the client"): make the first render identical on server and client. Do NOT render Date.now(), Math.random(), window size, localStorage/sessionStorage values, or browser-only theme/auth state during SSR. Use a mounted flag + useEffect, or render a stable placeholder first and hydrate the dynamic state after mount.
- For "Objects are not valid as a React child": some JSX is rendering a raw object instead of a primitive/node list. Find the exact expression and render a field like item.name/item.title, or map the array properly. Never output whole objects directly inside JSX.
- For JSON.parse SyntaxError "Unexpected end of JSON input": code is calling JSON.parse(localStorage.getItem('x')) without a fallback. The value is null or empty. Fix: JSON.parse(localStorage.getItem('x') || '[]') or JSON.parse(localStorage.getItem('x') || '{}'). Always provide a default for JSON.parse on localStorage/sessionStorage/fetch results.
- For pages that redirect to a selection screen: ensure the selection state persists in localStorage so the guard check passes after page reload
- Return valid JSON only`;

    // Build messages — include screenshots as image content blocks (Anthropic format)
    const messages: any[] = [];
    if (screenshotImages.length > 0) {
      const content: any[] = [{ type: 'text', text: fixPrompt }];
      for (const img of screenshotImages) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: img.base64 },
        });
        content.push({ type: 'text', text: `Screenshot of ${img.page} — fix the issues visible here.` });
      }
      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'user', content: fixPrompt });
    }

    const fixStream = aiProviderService.chatStream(
      options.model,
      messages,
      undefined,
      'Fix build errors. Return only valid JSON.',
      {
        temperature: 0,
        maxTokens: options.escalated ? 18000 : 12000,
        thinkingLevel: options.thinkingLevel,
        taskBudgetTokens: options.taskBudgetTokens,
        enablePromptCaching: options.model.startsWith('claude') ? config.projectOpusPromptCachingEnabled : undefined,
        promptCacheTtl: options.model.startsWith('claude') ? config.projectOpusPromptCacheTtl : undefined,
      },
    );
    let fixText = '';
    for await (const chunk of fixStream) {
      if (typeof chunk === 'string') fixText += chunk;
      else if ((chunk as StreamChunk).type === 'text' && 'text' in chunk && chunk.text) fixText += chunk.text;
      else if ((chunk as StreamChunk).type === 'done' && 'usage' in chunk) usage = chunk.usage || usage;
    }

    // Strip markdown fences if present
    const cleanJson = fixText.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const fixMatch = cleanJson.match(/\[[\s\S]*\]/);
    if (!fixMatch) {
      log.warn(`[Verify] AI returned no valid JSON (${fixText.length} chars): ${fixText.substring(0, 200)}`);
      return {
        applied: false,
        filesModified: [],
        duration: Date.now() - fixStartTime,
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        costEur: calculateStreamCostEur(options.model, usage),
      };
    }

    let fixes: { path: string; content: string }[];
    try {
      fixes = JSON.parse(fixMatch[0]);
    } catch (parseErr: any) {
      // AI sometimes returns JSON with unescaped control characters in file content
      // Try to recover by escaping literal newlines/tabs inside string values
      log.warn(`[Verify] JSON parse failed, attempting recovery: ${parseErr.message}`);
      try {
        const recovered = fixMatch[0]
          .replace(/(?<=:\s*"(?:[^"\\]|\\.)*)(\r?\n)(?=(?:[^"\\]|\\.)*")/g, '\\n')
          .replace(/(?<=:\s*"(?:[^"\\]|\\.)*)(\t)/g, '\\t');
        fixes = JSON.parse(recovered);
      } catch {
        log.warn(`[Verify] JSON recovery also failed`);
        return {
          applied: false,
          filesModified: [],
          duration: Date.now() - fixStartTime,
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          costEur: calculateStreamCostEur(options.model, usage),
        };
      }
    }
    const filesModified: string[] = [];
    for (const fix of fixes) {
      if (!fix.path || !fix.content?.trim()) continue;
      if (PROTECTED_CONFIG_FILES.has(fix.path)) {
        log.info(`[Verify] Skipping protected file: ${fix.path}`);
        continue;
      }
      await fileService.writeFile(projectId, fix.path, fix.content);
      log.info(`[Verify] Fixed: ${fix.path}`);
      filesModified.push(fix.path);
    }

    log.info(`[Verify] Applied ${filesModified.length} fixes`);
    return {
      applied: filesModified.length > 0,
      filesModified,
      duration: Date.now() - fixStartTime,
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      costEur: calculateStreamCostEur(options.model, usage),
    };
  } catch (err: any) {
    log.error(`[Verify] Auto-fix crashed: ${err.message}\n${err.stack || ''}`);
    return {
      applied: false,
      filesModified: [],
      duration: Date.now() - fixStartTime,
      inputTokens: 0,
      outputTokens: 0,
      costEur: 0,
    };
  }
}
