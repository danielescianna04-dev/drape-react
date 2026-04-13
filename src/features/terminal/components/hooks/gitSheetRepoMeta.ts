export const deriveGitSheetRepoMeta = (
  repoUrl: string | undefined,
  linkedUsername: string | undefined,
) => {
  const normalizedUrl = repoUrl?.trim() || '';
  const segments = normalizedUrl.split('/').filter(Boolean);
  const repoName = segments.length > 0 ? segments[segments.length - 1].replace(/\.git$/, '') : 'Repository';
  const repoOwner = segments.length > 1 ? segments[segments.length - 2] : '';
  const isOwnRepo = !!linkedUsername && linkedUsername.toLowerCase() === repoOwner.toLowerCase();

  return {
    repoName,
    repoOwner,
    isOwnRepo,
  };
};
