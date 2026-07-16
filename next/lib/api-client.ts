let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const response = await fetch("/api/auth/refresh", { method: "POST" });
  return response.ok;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401) return response;

  refreshInFlight ??= refreshSession().finally(() => {
    refreshInFlight = null;
  });
  if (!await refreshInFlight) return response;
  return fetch(input, init);
}
