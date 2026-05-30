let tokenPromise: Promise<string> | null = null;

async function getAuthToken(): Promise<string> {
  if (!tokenPromise) {
    tokenPromise = fetch("/api/auth/token", { cache: "no-store" }).then(
      async (res) => {
        if (!res.ok) {
          throw new Error(`Unable to load auth token (${res.status})`);
        }
        const data = (await res.json()) as { token?: string };
        if (!data.token) {
          throw new Error("Auth token response did not include a token");
        }
        return data.token;
      },
    );
  }
  return tokenPromise;
}

function isMutatingMethod(method: string | undefined): boolean {
  const normalized = (method ?? "GET").toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD";
}

function hasBody(init?: RequestInit): boolean {
  return init?.body !== undefined && !(init.body instanceof FormData);
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  if (!isMutatingMethod(init.method)) {
    return fetch(input, init);
  }

  const token = await getAuthToken();
  const headers = new Headers(init.headers);
  headers.set("X-Requested-With", "fetch");
  headers.set("Authorization", `Bearer ${token}`);
  if (hasBody(init) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

export function resetAuthTokenForTests(): void {
  tokenPromise = null;
}
