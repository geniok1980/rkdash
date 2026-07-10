import fs from 'fs';

function isDockerRuntime(): boolean {
  return fs.existsSync('/.dockerenv');
}

export function resolveReachableServiceBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (
      isDockerRuntime() &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    ) {
      url.hostname = 'host.docker.internal';
      return url.toString().replace(/\/$/, '');
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return trimmed.replace(/\/$/, '');
  }
}
