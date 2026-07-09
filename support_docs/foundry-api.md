# LOOM Foundry Server — API Reference
# Base URL: https://foundry.loom.dev/v1  (public)
#         : https://your-instance.internal/v1  (self-hosted)
#
# Authentication
# ──────────────
# API key:  Authorization: Bearer loom_<key>
# CLI auth: loom foundry login  →  stores key in ~/.loom/credentials.toml
#
# Namespaces
# ──────────
# @org/name      — organization-scoped (verified)
# @username/name — user-scoped
# name           — unscoped (discouraged; treated as @<username>/name)
#
# Package versioning
# ──────────────────
# Versions are strict semver. Ranges are supported on install:
#   @org/agent@latest   → highest non-prerelease
#   @org/agent@^1.2.0   → >=1.2.0 <2.0.0
#   @org/agent@1.3.1    → exact version
# ─────────────────────────────────────────────────────────────────────────────


# ── PACKAGES ──────────────────────────────────────────────────────────────────

GET /packages
  # List and search packages.
  query:
    q:        string           # full-text search across name, description, tags
    tags:     string[]         # filter by tag (comma-separated)
    type:     primary|sub-agent
    ns:       string           # filter by namespace
    sort:     downloads|recent|name  # default: relevance
    page:     integer          # default: 1
    limit:    integer          # default: 20, max: 100
  response:
    packages: PackageSummary[]
    total:    integer
    page:     integer
  auth: none

GET /packages/:namespace/:name
  # Full package metadata including all versions.
  response:
    name:        string         # @org/security-auditor
    type:        primary|sub-agent
    description: string
    author:      Author
    tags:        string[]
    latest:      string         # latest semver
    versions:    Version[]
    stats:
      downloads_total: integer
      downloads_month: integer
    test_status:
      passing: boolean
      last_run: datetime
      badge_url: string
    verified:    boolean        # namespace is verified
  auth: none

GET /packages/:namespace/:name/:version
  # Specific version detail.
  response:
    manifest:     object        # parsed loom-agent.yaml
    readme:       string        # rendered README.md
    test_results: TestResult[]
    compatibility:
      loom_versions: string[]
      backends:      string[]
    tarball_url:  string        # signed, expires in 1h
    published_at: datetime
    published_by: string
  auth: none

GET /packages/:namespace/:name/:version/download
  # Redirect to signed tarball URL.
  # CLI uses this — follows the redirect automatically.
  auth: none

POST /packages
  # Publish a new package or version.
  # Triggers async test runner — publish is pending until tests pass.
  content-type: multipart/form-data
  body:
    tarball:   file             # .loom.tgz package archive
    force:     boolean          # re-publish existing version (requires admin scope)
  response:
    publish_id:  string         # track publish job status
    status:      pending|testing|published|failed
    test_job_url: string
  auth: required (publish scope)
  rate_limit: 10 publishes/hour per namespace

GET /packages/:namespace/:name/:version/publish/:publish_id
  # Poll publish status.
  response:
    status:    pending|testing|published|failed
    test_log:  string
    errors:    string[]
  auth: required (same namespace)

DELETE /packages/:namespace/:name/:version
  # Yank a version (marks as deprecated, still downloadable).
  # Permanent delete requires admin.
  response:
    yanked: boolean
  auth: required (publish scope for namespace)


# ── NAMESPACES ────────────────────────────────────────────────────────────────

GET /namespaces/:name
  # Namespace profile.
  response:
    name:       string
    type:       user|org
    verified:   boolean
    packages:   PackageSummary[]
    members:    string[]        # only for orgs
    created_at: datetime
  auth: none

POST /namespaces
  # Create a new org namespace.
  body:
    name:        string
    display_name: string
    type:        user|org
  auth: required (any authenticated user)

POST /namespaces/:name/members
  # Add a member to an org namespace.
  body:
    username: string
    role:     member|admin
  auth: required (org admin scope)


# ── AUTH ──────────────────────────────────────────────────────────────────────

POST /auth/login
  # Exchange credentials for a session token.
  body:
    username: string
    password: string
  response:
    token:      string          # short-lived session token
    expires_at: datetime
  rate_limit: 10 attempts/15min per IP

POST /auth/keys
  # Create a long-lived API key for CLI use.
  body:
    name:   string             # e.g. "work-laptop"
    scopes: string[]           # install | publish | admin
  response:
    key:        string         # loom_<64-char-hex> — shown once
    key_id:     string
    scopes:     string[]
    created_at: datetime
  auth: required (session token)

DELETE /auth/keys/:key_id
  # Revoke an API key.
  auth: required (session token or admin)

POST /auth/logout
  # Invalidate session token.
  auth: required


# ── TEST RUNNER ───────────────────────────────────────────────────────────────

GET /test-runs/:publish_id
  # Full test run detail including per-test results.
  response:
    publish_id:  string
    status:      pending|running|passed|failed
    started_at:  datetime
    finished_at: datetime
    results:
      - test_id:   string
        name:      string
        status:    pass|fail|skip
        duration_ms: integer
        assertion_failures: AssertionFailure[]
    badge:
      passing: integer
      total:   integer
      url:     string
  auth: none (test results are public)


# ── HEALTH ────────────────────────────────────────────────────────────────────

GET /health
  # Liveness check. Returns 200 if server is up.
  response:
    status:  ok|degraded
    version: string
    storage: ok|error
    db:      ok|error
  auth: none

GET /health/ready
  # Readiness check. Returns 200 when fully ready to serve traffic.
  auth: none


# ── CLI REFERENCE ─────────────────────────────────────────────────────────────

# loom foundry login
#   Prompts for credentials, stores API key in ~/.loom/credentials.toml
#   Options: --instance <url>  (for self-hosted)

# loom foundry publish [./path]
#   Packages the agent directory into a .loom.tgz and POSTs to /packages.
#   Polls /packages/.../publish/:id until done.
#   Defaults to current directory.

# loom foundry install @ns/name[@version]
#   GETs /packages/:ns/:name/:version/download
#   Unpacks to ~/.loom/agents/@ns/name/
#   Registers in ~/.loom/agents.toml

# loom foundry search <query> [--tags <tags>] [--type <type>]
#   GETs /packages?q=&tags=&type=
#   Prints table of results

# loom foundry info @ns/name[@version]
#   GETs /packages/:ns/:name/:version
#   Prints full package detail

# loom foundry list
#   Reads ~/.loom/agents.toml
#   Lists installed agents with versions

# loom foundry update [@ns/name]
#   Checks for new versions of installed agents
#   Prompts before updating

# loom foundry uninstall @ns/name
#   Removes from ~/.loom/agents/ and agents.toml

# loom foundry logout
#   Revokes current API key, removes ~/.loom/credentials.toml


# ── PACKAGE TARBALL STRUCTURE ─────────────────────────────────────────────────

# A published package is a gzipped tar archive (.loom.tgz) with this structure:
#
# @loom-community/security-auditor-2.1.0.loom.tgz
# └── package/
#     ├── loom-agent.yaml        # REQUIRED: package manifest
#     ├── README.md              # REQUIRED: foundry listing
#     ├── prompts/
#     │   └── security.md        # system prompt (if referenced in manifest)
#     ├── schemas/
#     │   └── finding.json       # output schemas for sub-agents
#     └── tests/
#         └── loom-tests.yaml    # REQUIRED for publish: test suite


# ── ERROR RESPONSES ───────────────────────────────────────────────────────────

# All errors return:
# {
#   "error": "string",          # machine-readable code
#   "message": "string",        # human-readable detail
#   "docs": "string"            # URL to relevant docs
# }
#
# Common error codes:
#   unauthorized          → missing or invalid API key
#   forbidden             → valid key but insufficient scope
#   not_found             → package or version doesn't exist
#   conflict              → version already exists (use force=true to override)
#   test_failed           → publish blocked: tests did not pass
#   schema_invalid        → loom-agent.yaml failed validation
#   rate_limited          → slow down; Retry-After header included
#   namespace_taken       → namespace name is already registered
