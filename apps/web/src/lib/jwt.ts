/** Seconds until a JWT expires (no signature check — the API verifies; this only decides when to refresh). */
export function secondsLeft(token: string | undefined): number {
  if (!token) return 0;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return (payload.exp ?? 0) - Math.floor(Date.now() / 1000);
  } catch {
    return 0;
  }
}
