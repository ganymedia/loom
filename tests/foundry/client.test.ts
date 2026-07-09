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
          { error: "forbidden", message: "insufficient scope" },
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

  test("fails loudly on malformed JSON responses", async () => {
    const client = new FoundryClient({
      baseUrl: "https://foundry.example/v1",
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    });

    await expect(client.health()).rejects.toThrow("malformed JSON");
  });
});
