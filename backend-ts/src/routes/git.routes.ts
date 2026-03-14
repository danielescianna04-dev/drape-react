import { Router } from 'express';
import path from 'path';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { config } from '../config';
import { execShell, shellEscape, validateProjectId } from '../utils/helpers';
import { log } from '../utils/logger';
import { fileService } from '../services/file.service';

export const gitRouter = Router();

function projectDir(projectId: string): string {
  validateProjectId(projectId);
  return path.join(config.projectsRoot, projectId);
}

/** Prefix git commands with safe.directory=* so git doesn't refuse to operate
 *  on directories owned by a different UID (backend runs as root, files owned by 1000). */
function git(subcommand: string): string {
  return `git -c safe.directory='*' ${subcommand}`;
}

function getAuthUrl(url: string, token?: string): string {
  if (token && url.includes('github.com') && !url.includes('@')) {
    return url.replace('https://', `https://${token}@`);
  }
  return url;
}

function stripTokenFromUrl(url: string): string {
  // Remove token from https://token@github.com/... format
  return url.replace(/https:\/\/[^@]+@/, 'https://');
}

// GET /git/status/:projectId
gitRouter.get('/status/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);

  const [gitCheckResult, statusResult, branchResult, headResult, remoteHeadResult] = await Promise.all([
    execShell(git('rev-parse --is-inside-work-tree') + ' 2>/dev/null || echo "false"', dir),
    execShell(git('status --porcelain -uall') + ' 2>/dev/null || echo ""', dir),
    execShell(git('branch --show-current') + ' 2>/dev/null || echo ""', dir),
    execShell(git('rev-parse --short HEAD') + ' 2>/dev/null || echo ""', dir),
    execShell(`(${git('rev-parse --short origin/HEAD')} || ${git('rev-parse --short origin/main')}) 2>/dev/null || echo ""`, dir),
  ]);

  const isGitRepo = gitCheckResult.stdout.trim() === 'true';
  const branch = branchResult.stdout.trim();
  const isDetachedHead = !branch;
  const headHash = headResult.stdout.trim();

  // When in detached HEAD, find the branch that contains this commit
  let detachedFromBranch = '';
  if (isDetachedHead) {
    const containsResult = await execShell(git('branch --contains HEAD') + ' 2>/dev/null || echo ""', dir);
    // Filter out the "* (HEAD detached at ...)" line and get actual branch names
    const branches = containsResult.stdout.trim().split('\n')
      .map(b => b.trim().replace(/^\* /, ''))
      .filter(b => b && !b.startsWith('('));
    detachedFromBranch = branches[0] || 'main';
  }

  const activeBranch = branch || detachedFromBranch || 'main';

  // Always log from the branch tip (not HEAD) so we see all commits even in detached HEAD
  const headRef = isDetachedHead ? shellEscape(activeBranch) : 'HEAD';
  const [logResult, unpushedResult, behindResult] = await Promise.all([
    execShell(git(`log --all --topo-order --oneline -15`) + ' 2>/dev/null || echo ""', dir),
    // Count commits not on ANY remote branch (truly unpushed)
    execShell(git(`log ${headRef} --not --remotes --oneline`) + ' 2>/dev/null || echo ""', dir),
    // Behind count: commits on origin that we don't have
    execShell(`(${git(`rev-list --count ${headRef}..origin/HEAD`)} || ${git(`rev-list --count ${headRef}..origin/main`)}) 2>/dev/null || echo "0"`, dir),
  ]);

  // Remote tracking info
  const remoteHead = remoteHeadResult.stdout.trim() || null;
  const unpushedLines = unpushedResult.stdout.trim().split('\n').filter(Boolean);
  const ahead = unpushedLines.length > 0 && unpushedLines[0] !== '' ? unpushedLines.length : 0;
  const behind = parseInt(behindResult.stdout.trim()) || 0;
  // IMPORTANT: use trimEnd() not trim() — trim() removes leading space from the first line,
  // which corrupts the XY status columns of git status --porcelain format.
  const lines = statusResult.stdout.trimEnd().split('\n').filter(l => l.length >= 3);

  // Helper: extract file path, handling renames ("old -> new" format)
  const extractPath = (line: string): string => {
    const raw = line.substring(3);
    // Renamed files show as "old_name -> new_name" — extract just the new name
    if (line[0] === 'R' || line[0] === 'C') {
      const arrowIdx = raw.indexOf(' -> ');
      if (arrowIdx !== -1) return raw.substring(arrowIdx + 4);
    }
    return raw;
  };

  const changes = {
    staged: lines.filter(l => l[0] !== ' ' && l[0] !== '?').map(extractPath),
    modified: lines.filter(l => l[1] === 'M').map(extractPath),
    untracked: lines.filter(l => l.startsWith('??')).map(extractPath),
    deleted: lines.filter(l => l[1] === 'D' || l[0] === 'D').map(extractPath),
  };

  const commits = logResult.stdout.trim().split('\n').filter(Boolean).map(line => {
    const [hash, ...msgParts] = line.split(' ');
    return { hash, message: msgParts.join(' ') };
  });

  // Build per-branch commit membership: for each local branch, which commits are on it
  const branchListResult = await execShell(git('branch --format="%(refname:short)"') + ' 2>/dev/null || echo ""', dir);
  const localBranches = branchListResult.stdout.trim().split('\n').filter(Boolean);
  const commitBranches: Record<string, string[]> = {}; // hash -> [branch names]
  await Promise.all(localBranches.map(async (b) => {
    const result = await execShell(git(`log ${shellEscape(b)} --first-parent --format="%h" -15`) + ' 2>/dev/null || echo ""', dir);
    for (const h of result.stdout.trim().split('\n').filter(Boolean)) {
      if (!commitBranches[h]) commitBranches[h] = [];
      if (!commitBranches[h].includes(b)) commitBranches[h].push(b);
    }
  }));

  res.json({
    success: true,
    isGitRepo,
    branch: activeBranch,
    currentBranch: activeBranch,
    isDetachedHead,
    detachedAt: isDetachedHead ? headHash : null,
    changes,
    status: statusResult.stdout,
    hasChanges: lines.length > 0,
    commits,
    commitBranches,
    remoteHead,
    ahead,
    behind,
  });
}));

// POST /git/fetch/:projectId
gitRouter.post('/fetch/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const token = (req.headers['x-git-token'] as string) || undefined;

  // Set auth if token provided
  if (token) {
    const remote = await execShell(git('remote get-url origin') + ' 2>/dev/null || echo ""', dir);
    const url = remote.stdout.trim();
    if (url) {
      await execShell(git(`remote set-url origin ${shellEscape(getAuthUrl(url, token))}`), dir);
    }
  }

  try {
    const result = await execShell(git('fetch --all') + ' 2>&1', dir, 30000);
    res.json({ success: result.exitCode === 0, message: 'Fetch complete', output: stripTokenFromUrl(result.stdout), error: stripTokenFromUrl(result.stderr) });
  } finally {
    // Always reset remote URL to remove token, even on crash
    if (token) {
      const remote = await execShell(git('remote get-url origin') + ' 2>/dev/null || echo ""', dir);
      const currentUrl = remote.stdout.trim();
      if (currentUrl) {
        await execShell(git(`remote set-url origin ${shellEscape(stripTokenFromUrl(currentUrl))}`), dir).catch(() => {});
      }
    }
  }
}));

// POST /git/pull/:projectId
gitRouter.post('/pull/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const token = (req.headers['x-git-token'] as string) || undefined;
  const { branch, remote: targetRemote, rebase, stashAndReapply } = req.body || {};

  const remoteName = targetRemote || 'origin';

  if (token) {
    const remote = await execShell(git(`remote get-url ${shellEscape(remoteName)}`) + ' 2>/dev/null || echo ""', dir);
    const url = remote.stdout.trim();
    if (url) await execShell(git(`remote set-url ${shellEscape(remoteName)} ${shellEscape(getAuthUrl(url, token))}`), dir);
  }

  try {
    // Auto-stash if requested (only if there are local changes)
    let didStash = false;
    if (stashAndReapply) {
      const stashResult = await execShell(git('stash push -m "auto-stash before pull"') + ' 2>&1', dir);
      didStash = stashResult.exitCode === 0 && !stashResult.stdout.includes('No local changes');
    }

    // Build pull command
    let cmd = 'pull';
    if (rebase) cmd += ' --rebase';
    cmd += ` ${shellEscape(remoteName)}`;
    if (branch) cmd += ` ${shellEscape(branch)}`;

    const result = await execShell(git(cmd) + ' 2>&1', dir, 60000);

    // Pop stash only if we actually stashed something
    if (didStash) {
      await execShell(git('stash pop') + ' 2>&1', dir).catch(() => {});
    }

    if (result.exitCode === 0) {
      fileService.clearFileListCache(req.params.projectId);
    }

    res.json({ success: result.exitCode === 0, message: 'Pull complete', output: stripTokenFromUrl(result.stdout), error: stripTokenFromUrl(result.stderr) });
  } finally {
    // Always reset remote URL to remove token, even on crash
    if (token) {
      const remote = await execShell(git(`remote get-url ${shellEscape(remoteName)}`) + ' 2>/dev/null || echo ""', dir);
      const currentUrl = remote.stdout.trim();
      if (currentUrl) {
        await execShell(git(`remote set-url ${shellEscape(remoteName)} ${shellEscape(stripTokenFromUrl(currentUrl))}`), dir).catch(() => {});
      }
    }
  }
}));

// POST /git/push/:projectId
gitRouter.post('/push/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const token = (req.headers['x-git-token'] as string) || undefined;
  const { branch, remoteBranch, remote: targetRemote, forcePush, pushTags, setUpstream } = req.body || {};

  const remoteName = targetRemote || 'origin';
  log.info(`[Git Push] project=${req.params.projectId} branch=${branch} remoteBranch=${remoteBranch || branch} remote=${remoteName} hasToken=${!!token}`);

  if (token) {
    const remote = await execShell(git(`remote get-url ${shellEscape(remoteName)}`) + ' 2>/dev/null || echo ""', dir);
    const url = remote.stdout.trim();
    if (url) await execShell(git(`remote set-url ${shellEscape(remoteName)} ${shellEscape(getAuthUrl(url, token))}`), dir);
  }

  try {
    const isCrossBranch = remoteBranch && remoteBranch !== branch;
    let pushResult: { exitCode: number; stdout: string; stderr: string };

    if (isCrossBranch) {
      // Cross-branch push: checkout target → merge source → push → checkout back
      // This puts commits actually ON the target branch (like Fork does)
      log.info(`[Git Push] cross-branch: merging ${branch} into ${remoteBranch}, then pushing ${remoteBranch}`);

      // 0. Get committer identity from latest commit (needed for merge commit)
      const authorInfo = await execShell(git(`log -1 --format="%an|||%ae"`) + ' 2>/dev/null || echo "Drape User|||noreply@drape.info"', dir);
      const [authorName, authorEmail] = authorInfo.stdout.trim().split('|||');
      const mergeGit = (cmd: string) => `git -c safe.directory='*' -c user.name=${shellEscape(authorName || 'Drape User')} -c user.email=${shellEscape(authorEmail || 'noreply@drape.info')} ${cmd}`;

      // 1. Checkout target branch
      const checkoutResult = await execShell(git(`checkout ${shellEscape(remoteBranch)}`) + ' 2>&1', dir, 15000);
      if (checkoutResult.exitCode !== 0) {
        log.warn(`[Git Push] checkout ${remoteBranch} failed: ${checkoutResult.stdout}`);
        // Try checkout back to original branch
        await execShell(git(`checkout ${shellEscape(branch)}`) + ' 2>&1', dir, 15000).catch(() => {});
        res.json({ success: false, message: 'Checkout failed', output: checkoutResult.stdout, error: `Could not checkout ${remoteBranch}` });
        return;
      }

      // 2. Merge source branch into target (--no-ff to create visible merge commit)
      const mergeResult = await execShell(mergeGit(`merge --no-ff ${shellEscape(branch)} -m "Merge ${branch} into ${remoteBranch}"`) + ' 2>&1', dir, 30000);
      if (mergeResult.exitCode !== 0) {
        log.warn(`[Git Push] merge ${branch} into ${remoteBranch} failed: ${mergeResult.stdout}`);
        // Abort merge and go back
        await execShell(git('merge --abort') + ' 2>&1', dir, 10000).catch(() => {});
        await execShell(git(`checkout ${shellEscape(branch)}`) + ' 2>&1', dir, 15000).catch(() => {});
        res.json({ success: false, message: 'Merge failed', output: mergeResult.stdout, error: `Merge conflict: ${branch} → ${remoteBranch}` });
        return;
      }

      // 3. Push target branch
      let cmd = 'push';
      if (forcePush) cmd += ' --force';
      if (pushTags) cmd += ' --tags';
      if (setUpstream) cmd += ' -u';
      cmd += ` ${shellEscape(remoteName)} ${shellEscape(remoteBranch)}`;

      log.info(`[Git Push] cmd: git ${cmd}`);
      pushResult = await execShell(git(cmd) + ' 2>&1', dir, 60000);
      log.info(`[Git Push] exitCode=${pushResult.exitCode} output=${stripTokenFromUrl(pushResult.stdout).substring(0, 300)}`);

      // 4. Checkout back to original branch
      await execShell(git(`checkout ${shellEscape(branch)}`) + ' 2>&1', dir, 15000).catch(() => {});
    } else {
      // Normal push: push current branch to same-named remote
      let cmd = 'push';
      if (forcePush) cmd += ' --force';
      if (pushTags) cmd += ' --tags';
      if (setUpstream) cmd += ' -u';
      cmd += ` ${shellEscape(remoteName)}`;
      if (branch) cmd += ` ${shellEscape(branch)}`;

      log.info(`[Git Push] cmd: git ${cmd}`);
      pushResult = await execShell(git(cmd) + ' 2>&1', dir, 60000);
      log.info(`[Git Push] exitCode=${pushResult.exitCode} output=${stripTokenFromUrl(pushResult.stdout).substring(0, 300)}`);
    }

    // Fetch after push to update remote refs
    if (pushResult.exitCode === 0) {
      await execShell(git(`config remote.${shellEscape(remoteName)}.fetch '+refs/heads/*:refs/remotes/${shellEscape(remoteName)}/*'`), dir).catch(() => {});
      await execShell(git(`fetch ${shellEscape(remoteName)}`) + ' 2>&1', dir, 30000).catch(() => {});
    }

    res.json({ success: pushResult.exitCode === 0, message: 'Push complete', output: stripTokenFromUrl(pushResult.stdout), error: stripTokenFromUrl(pushResult.stderr) });
  } finally {
    // Always reset remote URL to remove token, even on crash
    if (token) {
      const remote = await execShell(git(`remote get-url ${shellEscape(remoteName)}`) + ' 2>/dev/null || echo ""', dir);
      const currentUrl = remote.stdout.trim();
      if (currentUrl) {
        await execShell(git(`remote set-url ${shellEscape(remoteName)} ${shellEscape(stripTokenFromUrl(currentUrl))}`), dir).catch(() => {});
      }
    }
  }
}));

// GET /git/remotes/:projectId
gitRouter.get('/remotes/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const result = await execShell(git('remote -v') + ' 2>/dev/null || echo ""', dir);
  const lines = result.stdout.trim().split('\n').filter(Boolean);
  const remotes: { name: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const [name, url] = line.split(/\s+/);
    if (name && url && !seen.has(name)) {
      seen.add(name);
      remotes.push({ name, url: stripTokenFromUrl(url) });
    }
  }
  res.json({ success: true, remotes });
}));

// POST /git/commit/:projectId
gitRouter.post('/commit/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const { message, files, authorName, authorEmail } = req.body;
  if (!message) throw new ValidationError('message required');

  // Stage files
  if (files && Array.isArray(files) && files.length > 0) {
    for (const file of files) {
      await execShell(git(`add ${shellEscape(file)}`), dir);
    }
  } else {
    await execShell(git('add -A'), dir);
  }

  // Build commit command with author info
  const name = authorName || 'Drape User';
  const email = authorEmail || 'user@drape.info';
  const commitCmd = `git -c safe.directory='*' -c user.name=${shellEscape(name)} -c user.email=${shellEscape(email)} commit -m ${shellEscape(message)} 2>&1`;
  const result = await execShell(commitCmd, dir);

  if (result.exitCode !== 0) {
    log.warn(`[Git] Commit failed in ${req.params.projectId}: ${result.stdout} ${result.stderr}`);
  }
  res.json({ success: result.exitCode === 0, message: result.exitCode === 0 ? 'Commit created' : 'Commit failed', output: result.stdout, error: result.stderr });
}));

// POST /git/checkout/:projectId
gitRouter.post('/checkout/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const { branch, create } = req.body;
  if (!branch) throw new ValidationError('branch required');

  const cmd = create
    ? git(`checkout -b ${shellEscape(branch)}`) + ' 2>&1'
    : git(`checkout ${shellEscape(branch)}`) + ' 2>&1';
  const result = await execShell(cmd, dir);
  if (result.exitCode === 0) {
    fileService.clearFileListCache(req.params.projectId);
  }
  res.json({ success: result.exitCode === 0, message: `Checked out ${branch}`, output: result.stdout });
}));

// GET /git/branches/:projectId
gitRouter.get('/branches/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const result = await execShell(git('branch') + ' 2>/dev/null || echo ""', dir);
  const current = await execShell(git('branch --show-current') + ' 2>/dev/null || echo ""', dir);

  const branches = result.stdout.trim().split('\n')
    .filter(Boolean)
    .map(b => b.trim().replace(/^\* /, ''));

  res.json({ success: true, branches, current: current.stdout.trim() });
}));

// GET /git/refs/:projectId — get all branch/tag refs mapped to commit SHAs
gitRouter.get('/refs/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  // Get all refs: branches + tags with their commit SHAs
  const [branchRefs, tagRefs] = await Promise.all([
    execShell(git('for-each-ref --format="%(objectname:short) %(refname:short)" refs/heads/ refs/remotes/') + ' 2>/dev/null || echo ""', dir),
    execShell(git('for-each-ref --format="%(objectname:short) %(refname:short)" refs/tags/') + ' 2>/dev/null || echo ""', dir),
  ]);

  // Build map: commitShortHash -> { branches: string[], tags: string[] }
  const refs: Record<string, { branches: string[]; tags: string[] }> = {};

  for (const line of branchRefs.stdout.trim().split('\n').filter(Boolean)) {
    const [hash, ...nameParts] = line.split(' ');
    const name = nameParts.join(' ');
    if (!hash || !name) continue;
    if (!refs[hash]) refs[hash] = { branches: [], tags: [] };
    refs[hash].branches.push(name);
  }

  for (const line of tagRefs.stdout.trim().split('\n').filter(Boolean)) {
    const [hash, ...nameParts] = line.split(' ');
    const name = nameParts.join(' ');
    if (!hash || !name) continue;
    if (!refs[hash]) refs[hash] = { branches: [], tags: [] };
    refs[hash].tags.push(name);
  }

  res.json({ success: true, refs });
}));

// POST /git/init/:projectId
gitRouter.post('/init/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const { repoUrl } = req.body;
  const token = (req.headers['x-git-token'] as string) || undefined;

  const results: string[] = [];

  const init = await execShell(git('init') + ' 2>&1', dir);
  results.push(init.stdout);

  await execShell(git('add -A') + ' 2>&1', dir);
  const commit = await execShell(git('commit -m "Initial commit"') + ' 2>&1', dir);
  results.push(commit.stdout);

  if (repoUrl) {
    const authUrl = getAuthUrl(repoUrl, token);
    await execShell(git(`remote add origin ${shellEscape(authUrl)}`) + ' 2>&1', dir);
    await execShell(git('branch -M main') + ' 2>&1', dir);
    try {
      const push = await execShell(git('push -u origin main') + ' 2>&1', dir, 60000);
      results.push(push.stdout);
    } finally {
      // Always reset remote URL to remove token, even on crash
      if (token) {
        await execShell(git(`remote set-url origin ${shellEscape(stripTokenFromUrl(authUrl))}`), dir).catch(() => {});
      }
    }
  }

  res.json({ success: true, message: 'Git initialized', results });
}));

// POST /git/remote-branches — list remote branches without cloning
gitRouter.post('/remote-branches', asyncHandler(async (req, res) => {
  const { repositoryUrl, token } = req.body;
  if (!repositoryUrl) throw new ValidationError('repositoryUrl required');

  const authUrl = getAuthUrl(repositoryUrl, token);
  const result = await execShell(
    git(`ls-remote --heads ${shellEscape(authUrl)}`) + ' 2>&1',
    '/tmp',
    15000,
  );

  if (result.exitCode !== 0) {
    return res.json({ success: false, branches: [], error: result.stderr });
  }

  const branches = result.stdout.trim().split('\n')
    .filter(Boolean)
    .map(line => line.split('\t')[1]?.replace('refs/heads/', ''))
    .filter(Boolean);

  res.json({ success: true, branches });
}));

// POST /git/stash/:projectId
gitRouter.post('/stash/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const { action, message } = req.body;

  let cmd: string;
  switch (action) {
    case 'push': cmd = message ? git(`stash push -m ${shellEscape(message)}`) + ' 2>&1' : git('stash push') + ' 2>&1'; break;
    case 'pop': cmd = git('stash pop') + ' 2>&1'; break;
    case 'list': cmd = git('stash list') + ' 2>&1'; break;
    default: throw new ValidationError('action must be push, pop, or list');
  }

  const result = await execShell(cmd, dir);
  res.json({ success: result.exitCode === 0, message: `Stash ${action} complete`, output: result.stdout });
}));

// GET /git/diff/:projectId — get diff for a specific file (or all files)
gitRouter.get('/diff/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const file = req.query.file as string | undefined;

  // Use 'HEAD --' to handle deleted files and avoid ambiguous argument errors
  const cmd = file
    ? git(`diff HEAD -- ${shellEscape(file)}`) + ' 2>&1'
    : git('diff HEAD') + ' 2>&1';

  const result = await execShell(cmd, dir, 15000);

  // For untracked files, git diff returns nothing — show entire file content instead
  if (!result.stdout.trim() && file) {
    const untrackedCheck = await execShell(git(`status --porcelain -- ${shellEscape(file)}`) + ' 2>/dev/null', dir);
    if (untrackedCheck.stdout.trim().startsWith('??')) {
      const catResult = await execShell(`cat ${shellEscape(file)} 2>/dev/null`, dir);
      const lines = catResult.stdout.split('\n');
      const fakeDiff = [
        `diff --git a/${file} b/${file}`,
        'new file mode 100644',
        `--- /dev/null`,
        `+++ b/${file}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map(l => `+${l}`),
      ].join('\n');
      return res.json({ success: true, diff: fakeDiff });
    }
  }

  res.json({ success: result.exitCode === 0, diff: result.stdout });
}));

// GET /git/commit-files/:projectId — get files changed in a specific commit
gitRouter.get('/commit-files/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const commit = req.query.commit as string;
  if (!commit) throw new ValidationError('commit hash required');

  const result = await execShell(git(`diff-tree --no-commit-id --name-status -r ${shellEscape(commit)}`) + ' 2>&1', dir);
  if (result.exitCode !== 0) {
    return res.json({ success: false, error: result.stdout.trim() || 'Failed to get commit files' });
  }

  const files = result.stdout.trim().split('\n').filter(Boolean).map(line => {
    const [status, ...fileParts] = line.split('\t');
    return { status: status.charAt(0), file: fileParts.join('\t') };
  });

  res.json({ success: true, files });
}));

// GET /git/commit-diff/:projectId — get diff for a specific file in a specific commit
gitRouter.get('/commit-diff/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const commit = req.query.commit as string;
  const file = req.query.file as string;
  if (!commit) throw new ValidationError('commit hash required');
  if (!file) throw new ValidationError('file path required');

  const result = await execShell(git(`diff ${shellEscape(commit)}^..${shellEscape(commit)} -- ${shellEscape(file)}`) + ' 2>&1', dir, 15000);
  res.json({ success: result.exitCode === 0, diff: result.stdout });
}));

// POST /git/revert/:projectId — revert a specific commit (creates a new commit)
gitRouter.post('/revert/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const { hash, authorName, authorEmail } = req.body;
  if (!hash) throw new ValidationError('hash required');

  const name = authorName || 'Drape User';
  const email = authorEmail || 'user@drape.info';
  const cmd = `git -c safe.directory='*' -c user.name=${shellEscape(name)} -c user.email=${shellEscape(email)} revert --no-edit ${shellEscape(hash)} 2>&1`;
  const result = await execShell(cmd, dir, 15000);

  // Auto-abort on failure to avoid leaving repo in conflicted state
  if (result.exitCode !== 0) {
    await execShell(git('revert --abort') + ' 2>/dev/null', dir).catch(() => {});
    const raw = result.stdout.trim() || result.stderr.replace(/^Command failed:.*?\n?/, '').trim();
    const errorMsg = raw.includes('CONFLICT') ? 'Revert failed: merge conflicts detected. The operation was aborted.' : (raw || 'Revert failed');
    res.json({ success: false, message: 'Revert failed', output: result.stdout, error: errorMsg });
    return;
  }

  res.json({ success: true, message: 'Commit reverted', output: result.stdout });
}));

// POST /git/cherry-pick/:projectId — cherry-pick a commit onto current branch
gitRouter.post('/cherry-pick/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const { hash, authorName, authorEmail } = req.body;
  if (!hash) throw new ValidationError('hash required');

  const name = authorName || 'Drape User';
  const email = authorEmail || 'user@drape.info';
  const cmd = `git -c safe.directory='*' -c user.name=${shellEscape(name)} -c user.email=${shellEscape(email)} cherry-pick ${shellEscape(hash)} 2>&1`;
  const result = await execShell(cmd, dir, 15000);

  // Auto-abort on failure to avoid leaving repo in conflicted state
  if (result.exitCode !== 0) {
    await execShell(git('cherry-pick --abort') + ' 2>/dev/null', dir).catch(() => {});
    const raw = result.stdout.trim() || result.stderr.replace(/^Command failed:.*?\n?/, '').trim();
    const errorMsg = raw.includes('CONFLICT') ? 'Cherry-pick failed: merge conflicts detected. The operation was aborted.' : (raw || 'Cherry-pick failed');
    res.json({ success: false, message: 'Cherry-pick failed', output: result.stdout, error: errorMsg });
    return;
  }

  res.json({ success: true, message: 'Cherry-pick applied', output: result.stdout });
}));

// POST /git/branch-from/:projectId — create a new branch from a specific commit
gitRouter.post('/branch-from/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const { hash, branchName } = req.body;
  if (!hash) throw new ValidationError('hash required');
  if (!branchName) throw new ValidationError('branchName required');

  const result = await execShell(git(`checkout -b ${shellEscape(branchName)} ${shellEscape(hash)}`) + ' 2>&1', dir);
  if (result.exitCode === 0) {
    fileService.clearFileListCache(req.params.projectId);
  }
  const errorMsg = result.stdout.trim() || result.stderr.replace(/^Command failed:.*?\n?/, '').trim();
  res.json({ success: result.exitCode === 0, message: result.exitCode === 0 ? `Branch '${branchName}' created` : 'Branch creation failed', output: result.stdout, error: errorMsg || 'Branch creation failed' });
}));

// POST /git/discard/:projectId — discard changes in specified files
gitRouter.post('/discard/:projectId', asyncHandler(async (req, res) => {
  const dir = projectDir(req.params.projectId);
  const { files } = req.body as { files?: string[] };

  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new ValidationError('files must be a non-empty array');
  }

  // Security: reject paths with .. or absolute paths to prevent path traversal
  for (const f of files) {
    if (f.includes('..') || f.startsWith('/')) {
      throw new ValidationError(`Invalid file path: ${f}`);
    }
  }

  const errors: string[] = [];
  let discarded = 0;

  log.info(`[Git] Discard requested for ${files.length} file(s) in ${req.params.projectId}: ${files.join(', ')}`);

  for (const file of files) {
    try {
      // Check if file is untracked
      const statusCheck = await execShell(
        git(`status --porcelain ${shellEscape(file)}`), dir
      );
      const status = statusCheck.stdout.trim();
      log.info(`[Git] Discard: file=${file}, status="${status}", exitCode=${statusCheck.exitCode}`);

      if (status.startsWith('??')) {
        // Untracked — remove file or directory
        const rmResult = await execShell(`rm -rf ${shellEscape(file)}`, dir);
        if (rmResult.exitCode !== 0) {
          errors.push(`${file}: rm failed: ${rmResult.stderr}`);
          continue;
        }
      } else {
        // Tracked file (modified/deleted) — restore from HEAD
        const checkoutResult = await execShell(git(`checkout -- ${shellEscape(file)}`), dir);
        if (checkoutResult.exitCode !== 0) {
          errors.push(`${file}: checkout failed: ${checkoutResult.stderr}`);
          continue;
        }
      }
      discarded++;
    } catch (e: any) {
      errors.push(`${file}: ${e.message}`);
    }
  }

  // Verify the discard actually worked
  const verifyResult = await execShell(git('status --porcelain'), dir);
  log.info(`[Git] Discard complete: discarded=${discarded}, errors=${errors.length}, remaining changes:\n${verifyResult.stdout.trim()}`);

  if (discarded > 0) {
    fileService.clearFileListCache(req.params.projectId);
  }
  res.json({ success: errors.length === 0, discarded, errors });
}));
