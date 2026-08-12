export const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export function withServerUrl(pathOrUrl: string | null): string | null {
  if (!pathOrUrl) {
    return null;
  }
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  return `${serverUrl}${pathOrUrl}`;
}
