export type FoundryFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type FoundryPackageType = "primary" | "sub-agent";
export type FoundryPackageSort = "downloads" | "recent" | "name";
export type FoundryPublishStatus =
  | "pending"
  | "testing"
  | "published"
  | "failed";

export interface FoundryClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: FoundryFetch;
}

export interface FoundrySearchOptions {
  q?: string;
  tags?: string[];
  type?: FoundryPackageType;
  ns?: string;
  sort?: FoundryPackageSort;
  page?: number;
  limit?: number;
}

export interface FoundryPackageSummary {
  name: string;
  type: FoundryPackageType;
  description?: string;
  tags?: string[];
  latest?: string;
  verified?: boolean;
}

export interface FoundryPackageSearchResponse {
  packages: FoundryPackageSummary[];
  total: number;
  page: number;
}

export interface FoundryPackageDetail {
  name: string;
  type: FoundryPackageType;
  description: string;
  author: unknown;
  tags: string[];
  latest: string;
  versions: unknown[];
  stats: {
    downloads_total: number;
    downloads_month: number;
  };
  test_status: {
    passing: boolean;
    last_run: string;
    badge_url: string;
  };
  verified: boolean;
}

export interface FoundryVersionDetail {
  manifest: unknown;
  readme: string;
  test_results: unknown[];
  compatibility: {
    loom_versions: string[];
    backends: string[];
  };
  tarball_url: string;
  published_at: string;
  published_by: string;
}

export interface FoundryPublishResponse {
  publish_id: string;
  status: FoundryPublishStatus;
  test_job_url: string;
}

export interface FoundryPublishStatusResponse {
  status: FoundryPublishStatus;
  test_log: string;
  errors: string[];
}

export interface FoundryLoginResponse {
  token: string;
  expires_at: string;
}

export interface FoundryCreateKeyResponse {
  key: string;
  key_id: string;
  scopes: string[];
  created_at: string;
}

export interface FoundryHealthResponse {
  status: "ok" | "degraded";
  version: string;
  storage: "ok" | "error";
  db: "ok" | "error";
}

export interface FoundryErrorBody {
  error: string;
  message: string;
  docs?: string;
}

export class FoundryClientError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly docs: string | undefined;

  constructor(
    message: string,
    options: { status: number; code?: string; docs?: string },
  ) {
    super(message);
    this.name = "FoundryClientError";
    this.status = options.status;
    this.code = options.code;
    this.docs = options.docs;
  }
}

export class FoundryClient {
  private readonly baseUrl: URL;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: FoundryFetch;

  constructor(options: FoundryClientOptions) {
    if (options.baseUrl.trim().length === 0) {
      throw new FoundryClientError("Foundry base URL must not be empty", {
        status: 0,
      });
    }
    this.baseUrl = new URL(ensureTrailingSlash(options.baseUrl));
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async searchPackages(
    options: FoundrySearchOptions = {},
  ): Promise<FoundryPackageSearchResponse> {
    const query = new URLSearchParams();
    appendQuery(query, "q", options.q);
    appendQuery(query, "tags", options.tags?.join(","));
    appendQuery(query, "type", options.type);
    appendQuery(query, "ns", options.ns);
    appendQuery(query, "sort", options.sort);
    appendQuery(query, "page", options.page?.toString());
    appendQuery(query, "limit", options.limit?.toString());

    return this.requestJson<FoundryPackageSearchResponse>(
      `packages${query.size > 0 ? `?${query.toString()}` : ""}`,
    );
  }

  async getPackage(
    namespace: string,
    name: string,
  ): Promise<FoundryPackageDetail> {
    return this.requestJson<FoundryPackageDetail>(
      `packages/${encodePathPart(namespace)}/${encodePathPart(name)}`,
    );
  }

  async getPackageVersion(
    namespace: string,
    name: string,
    version: string,
  ): Promise<FoundryVersionDetail> {
    return this.requestJson<FoundryVersionDetail>(
      `packages/${encodePathPart(namespace)}/${encodePathPart(name)}/${encodePathPart(version)}`,
    );
  }

  async downloadPackage(
    namespace: string,
    name: string,
    version: string,
  ): Promise<Response> {
    return this.requestRaw(
      `packages/${encodePathPart(namespace)}/${encodePathPart(name)}/${encodePathPart(version)}/download`,
    );
  }

  async publishPackage(options: {
    tarball: Blob;
    force?: boolean;
  }): Promise<FoundryPublishResponse> {
    const form = new FormData();
    form.append("tarball", options.tarball, "package.loom.tgz");
    if (options.force !== undefined)
      form.append("force", String(options.force));

    return this.requestJson<FoundryPublishResponse>("packages", {
      method: "POST",
      body: form,
    });
  }

  async getPublishStatus(
    namespace: string,
    name: string,
    version: string,
    publishId: string,
  ): Promise<FoundryPublishStatusResponse> {
    return this.requestJson<FoundryPublishStatusResponse>(
      `packages/${encodePathPart(namespace)}/${encodePathPart(name)}/${encodePathPart(version)}/publish/${encodePathPart(publishId)}`,
    );
  }

  async yankPackageVersion(
    namespace: string,
    name: string,
    version: string,
  ): Promise<{ yanked: boolean }> {
    return this.requestJson<{ yanked: boolean }>(
      `packages/${encodePathPart(namespace)}/${encodePathPart(name)}/${encodePathPart(version)}`,
      { method: "DELETE" },
    );
  }

  async login(
    username: string,
    password: string,
  ): Promise<FoundryLoginResponse> {
    return this.requestJson<FoundryLoginResponse>("auth/login", {
      method: "POST",
      json: { username, password },
    });
  }

  async createApiKey(
    name: string,
    scopes: string[],
  ): Promise<FoundryCreateKeyResponse> {
    return this.requestJson<FoundryCreateKeyResponse>("auth/keys", {
      method: "POST",
      json: { name, scopes },
    });
  }

  async revokeApiKey(keyId: string): Promise<void> {
    await this.requestRaw(`auth/keys/${encodePathPart(keyId)}`, {
      method: "DELETE",
    });
  }

  async logout(): Promise<void> {
    await this.requestRaw("auth/logout", { method: "POST" });
  }

  async health(): Promise<FoundryHealthResponse> {
    return this.requestJson<FoundryHealthResponse>("health");
  }

  async readiness(): Promise<Response> {
    return this.requestRaw("health/ready");
  }

  private async requestJson<T>(
    path: string,
    options: FoundryRequestOptions = {},
  ): Promise<T> {
    const response = await this.requestRaw(path, options);
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new FoundryClientError(
        `Foundry returned malformed JSON for ${options.method ?? "GET"} /${path}`,
        { status: response.status },
      );
    }
  }

  private async requestRaw(
    path: string,
    options: FoundryRequestOptions = {},
  ): Promise<Response> {
    const url = new URL(path, this.baseUrl);
    const headers = new Headers(options.headers);
    if (this.apiKey !== undefined)
      headers.set("Authorization", `Bearer ${this.apiKey}`);
    if (options.json !== undefined)
      headers.set("Content-Type", "application/json");

    const requestInit: RequestInit = {
      method: options.method ?? "GET",
      headers,
    };
    const body =
      options.json !== undefined ? JSON.stringify(options.json) : options.body;
    if (body !== undefined) requestInit.body = body;

    const response = await this.fetchImpl(url, requestInit);

    if (!response.ok) {
      throw await buildFoundryError(response, options.method ?? "GET", path);
    }

    return response;
  }
}

interface FoundryRequestOptions {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit;
  json?: unknown;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function appendQuery(
  query: URLSearchParams,
  key: string,
  value: string | undefined,
): void {
  if (value !== undefined && value.length > 0) query.set(key, value);
}

function encodePathPart(value: string): string {
  if (value.trim().length === 0) {
    throw new FoundryClientError("Foundry path values must not be empty", {
      status: 0,
    });
  }
  return encodeURIComponent(value);
}

async function buildFoundryError(
  response: Response,
  method: string,
  path: string,
): Promise<FoundryClientError> {
  const body = await readErrorBody(response);
  if (body !== undefined) {
    const errorOptions: { status: number; code?: string; docs?: string } = {
      status: response.status,
      code: body.error,
    };
    if (body.docs !== undefined) errorOptions.docs = body.docs;
    return new FoundryClientError(body.message, errorOptions);
  }

  return new FoundryClientError(
    `Foundry request failed: ${method} /${path} returned ${response.status}`,
    { status: response.status },
  );
}

async function readErrorBody(
  response: Response,
): Promise<FoundryErrorBody | undefined> {
  try {
    const body = (await response.json()) as Partial<FoundryErrorBody>;
    if (typeof body.error === "string" && typeof body.message === "string") {
      const errorBody: FoundryErrorBody = {
        error: body.error,
        message: body.message,
      };
      if (typeof body.docs === "string") errorBody.docs = body.docs;
      return errorBody;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
