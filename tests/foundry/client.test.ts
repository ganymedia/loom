import { describe, expect, test } from "bun:test";
import { FoundryClient, FoundryClientError } from "@loom/foundry/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("FoundryClient", () => {
  test("searches packages with encoded query parameters", async () => {
    let requested: URL | undefined;
    const client = new FoundryClient({
      baseUrl: "https://foundry.example/v1",
      fetchImpl: async (input) => {
        requested = new URL(input.toString());
        return jsonResponse({ packages: [], total: 0, page: 2 });
      },
    });

    const result = await client.searchPackages({
      q: "security auditor",
      tags: ["sast", "owasp"],
      type: "sub-agent",
      ns: "@loom",
      sort: "downloads",
      page: 2,
      limit: 50,
    });

    expect(result.page).toBe(2);
    expect(requested?.pathname).toBe("/v1/packages");
    expect(requested?.searchParams.get("q")).toBe("security auditor");
    expect(requested?.searchParams.get("tags")).toBe("sast,owasp");
    expect(requested?.searchParams.get("type")).toBe("sub-agent");
    expect(requested?.searchParams.get("ns")).toBe("@loom");
    expect(requested?.searchParams.get("sort")).toBe("downloads");
    expect(requested?.searchParams.get("page")).toBe("2");
    expect(requested?.searchParams.get("limit")).toBe("50");
  });

  test("adds bearer auth without leaking it into errors", async () => {
    const authHeaders: Array<string | null> = [];
    const client = new FoundryClient({
      baseUrl: "https://foundry.example/v1",
      apiKey: "loom_test_secret",
      fetchImpl: async (_input, init) => {
        authHeaders.push(new Headers(init?.headers).get("Authorization"));
        return jsonResponse(
          { error: "forbidden", message: "echoed loom_test_secret" },
          403,
        );
      },
    });

    await expect(
      client.createApiKey("work-laptop", ["install"]),
    ).rejects.toThrow(FoundryClientError);
    expect(authHeaders[0]).toBe("Bearer loom_test_secret");

    try {
      await client.createApiKey("work-laptop", ["install"]);
    } catch (error) {
      expect(error).toBeInstanceOf(FoundryClientError);
      expect(String(error)).not.toContain("loom_test_secret");
      expect(String(error)).toContain("POST returned 403");
    }
  });

  test("publishes tarballs as multipart form data", async () => {
    let method: string | undefined;
    let body: BodyInit | null | undefined;
    const client = new FoundryClient({
      baseUrl: "https://foundry.example/v1/",
      fetchImpl: async (_input, init) => {
        method = init?.method;
        body = init?.body;
        return jsonResponse({
          publish_id: "pub-1",
          status: "pending",
          test_job_url: "/test-runs/pub-1",
        });
      },
    });

    const result = await client.publishPackage({
      tarball: new Blob(["archive"]),
      force: true,
    });

    expect(method).toBe("POST");
    expect(body).toBeInstanceOf(FormData);
    expect(result.publish_id).toBe("pub-1");
  });

  test("encodes package path segments", async () => {
    let path = "";
    const client = new FoundryClient({
      baseUrl: "https://foundry.example/v1",
      fetchImpl: async (input) => {
        path = new URL(input.toString()).pathname;
        return jsonResponse({
          manifest: {},
          readme: "",
          test_results: [],
          compatibility: { loom_versions: [], backends: [] },
          tarball_url: "https://tarball",
          published_at: "now",
          published_by: "me",
        });
      },
    });

    await client.getPackageVersion("@loom", "security/auditor", "1.2.3");

    expect(path).toBe("/v1/packages/%40loom/security%2Fauditor/1.2.3");
  });

  test("covers namespace endpoints from the Foundry API spec", async () => {
    const requests: Array<{ path: string; method: string; body?: unknown }> =
      [];
    const client = new FoundryClient({
      baseUrl: "https://foundry.example/v1",
      fetchImpl: async (input, init) => {
        const bodyText =
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        requests.push({
          path: new URL(input.toString()).pathname,
          method: init?.method ?? "GET",
          ...(bodyText === undefined ? {} : { body: bodyText }),
        });
        return jsonResponse({
          name: "@loom",
          type: "org",
          verified: true,
          packages: [],
          members: ["alice"],
          created_at: "now",
        });
      },
    });

    await client.getNamespace("@loom");
    await client.createNamespace({
      name: "loom-tools",
      display_name: "LOOM Tools",
      type: "org",
    });
    await client.addNamespaceMember("@loom", {
      username: "alice",
      role: "admin",
    });

    expect(requests).toEqual([
      { path: "/v1/namespaces/%40loom", method: "GET" },
      {
        path: "/v1/namespaces",
        method: "POST",
        body: { name: "loom-tools", display_name: "LOOM Tools", type: "org" },
      },
      {
        path: "/v1/namespaces/%40loom/members",
        method: "POST",
        body: { username: "alice", role: "admin" },
      },
    ]);
  });

  test("fetches public test-run detail", async () => {
    let path = "";
    const client = new FoundryClient({
      baseUrl: "https://foundry.example/v1",
      fetchImpl: async (input) => {
        path = new URL(input.toString()).pathname;
        return jsonResponse({
          publish_id: "publish/1",
          status: "passed",
          started_at: "start",
          finished_at: "finish",
          results: [
            {
              test_id: "sec-001",
              name: "detects SQL injection",
              status: "pass",
              duration_ms: 12,
              assertion_failures: [],
            },
          ],
          badge: { passing: 1, total: 1, url: "https://badge" },
        });
      },
    });

    const result = await client.getTestRun("publish/1");

    expect(path).toBe("/v1/test-runs/publish%2F1");
    expect(result.results[0]?.test_id).toBe("sec-001");
  });

  test("fails loudly on malformed JSON responses", async () => {
    const client = new FoundryClient({
      baseUrl: "https://foundry.example/v1",
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    });

    await expect(client.health()).rejects.toThrow("malformed JSON");
  });
});
