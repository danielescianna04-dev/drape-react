export const extractGitHubRepoUrlFromDeepLink = (url: string): string | null => {
  const decodedUrl = decodeURIComponent(url);
  const githubMatch = decodedUrl.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (!githubMatch) return null;

  return `https://github.com/${githubMatch[1]}/${githubMatch[2]}`;
};

