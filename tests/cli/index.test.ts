import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runCli(
  args: string[],
  options: { cwd?: string; entrypoint?: string } = {},
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn(
    ["bun", options.entrypoint ?? "src/index.ts", ...args],
    {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}

async function buildCompiledCli(): Promise<string> {
  const outDir = await mkdtemp(join(tmpdir(), "loom-compiled-cli-"));
  const binaryPath = join(outDir, "loom");
  const proc = Bun.spawn(
    ["bun", "build", "--compile", "./src/index.ts", "--outfile", binaryPath],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `compiled CLI build failed\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }
  return binaryPath;
}

async function runCompiledSessionWithPty(options: {
  binaryPath: string;
  cycleAgent: boolean;
  exitInput: "ctrl-c" | "escape";
  firstRun: boolean;
  home: string;
  projectRoot: string;
  backendUrl: string;
  resize: boolean;
}): Promise<{
  cycledAgent: boolean;
  exitCode: number;
  output: string;
  resizeRendered: boolean;
}> {
  const python = String.raw`
import fcntl, json, os, pty, select, struct, subprocess, sys, termios, time

binary_path, home, project_root, backend_url, first_run, cycle_agent, exit_input, resize = sys.argv[1:9]
first_run = first_run == "1"
cycle_agent = cycle_agent == "1"
resize = resize == "1"
master, slave = pty.openpty()
env = os.environ.copy()
env["HOME"] = home
proc = subprocess.Popen(
    [binary_path],
    stdin=slave,
    stdout=slave,
    stderr=slave,
    env=env,
    cwd=project_root,
    close_fds=True,
)
os.close(slave)
output = b""
sent_url = not first_run
sent_resize = not resize
resize_rendered = not resize
sent_tab = False
cycled_agent = False
sent_exit = False
deadline = time.time() + 15

def send_exit():
    global sent_exit
    os.write(master, b"\x03" if exit_input == "ctrl-c" else b"\x1b")
    sent_exit = True

while time.time() < deadline:
    ready, _, _ = select.select([master], [], [], 0.1)
    if ready:
        try:
            chunk = os.read(master, 4096)
        except OSError:
            break
        if not chunk:
            break
        output += chunk
        text = output.decode(errors="replace")
        if not sent_url and "OpenAI-compatible backend URL:" in text:
            time.sleep(0.2)
            os.write(master, f"{backend_url}\n".encode())
            sent_url = True
        if sent_url and not sent_resize and "Enter follow-up prompts." in text:
            fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 18, 40, 0, 0))
            sent_resize = True
        if sent_url and sent_resize and cycle_agent and not sent_tab and "Enter follow-up prompts." in text:
            time.sleep(0.1)
            os.write(master, b"\t")
            sent_tab = True
        if sent_tab and not sent_exit and "architect" in text:
            cycled_agent = True
            resize_rendered = True
            send_exit()
        if sent_url and sent_resize and not cycle_agent and not sent_exit and "Enter follow-up prompts." in text:
            send_exit()
    if proc.poll() is not None:
        break

if proc.poll() is None:
    proc.terminate()
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=2)

print(json.dumps({
    "cycledAgent": cycled_agent,
    "exitCode": proc.returncode,
    "output": output.decode(errors="replace"),
    "resizeRendered": resize_rendered,
}))
`;
  const proc = Bun.spawn(
    [
      "python3",
      "-c",
      python,
      options.binaryPath,
      options.home,
      options.projectRoot,
      options.backendUrl,
      options.firstRun ? "1" : "0",
      options.cycleAgent ? "1" : "0",
      options.exitInput,
      options.resize ? "1" : "0",
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `pty harness failed\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }
  return JSON.parse(stdout) as {
    cycledAgent: boolean;
    exitCode: number;
    output: string;
    resizeRendered: boolean;
  };
}

async function runCompiledNonTty(options: {
  args: string[];
  binaryPath: string;
  home: string;
  input: string;
  projectRoot: string;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([options.binaryPath, ...options.args], {
    cwd: options.projectRoot,
    env: { ...process.env, HOME: options.home },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(options.input);
  await proc.stdin.end();

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe("CLI entrypoint", () => {
  test("prints version and exits without starting a session", async () => {
    const result = await runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("0.1.0");
    expect(result.stderr).not.toContain("loom: fatal error");
  });

  test("prints help and exits without fatal wrapper output", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: loom [options] [command]");
    expect(result.stdout).toContain("pipeline");
    expect(result.stderr).not.toContain("loom: fatal error");
  });

  test("rejects unknown top-level options instead of starting a session", async () => {
    const result = await runCli(["--VERSION"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("unknown option '--VERSION'");
    expect(result.stdout).not.toContain("OpenAI-compatible backend URL:");
    expect(result.stderr).not.toContain("loom: fatal error");
  });

  test("rejects unexpected top-level positional arguments", async () => {
    const result = await runCli(["http://127.0.0.1:7000/v1"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("unknown command");
    expect(result.stdout).not.toContain("LOOM session started.");
    expect(result.stderr).not.toContain("loom: fatal error");
  });

  test("runs a pipeline through the public entrypoint", async () => {
    const repoRoot = process.cwd();
    const projectRoot = await mkdtemp(join(tmpdir(), "loom-entrypoint-"));
    await mkdir(join(projectRoot, ".loom"));
    await writeFile(
      join(projectRoot, ".loom", "entry.loom"),
      `name: entrypoint-pipeline
version: "1"
stages:
  - id: result
    type: transform
    expression: runtime.message
`,
      "utf8",
    );

    const result = await runCli(
      [
        "pipeline",
        "run",
        ".loom/entry.loom",
        "--var",
        "runtime.message=hello from cli",
      ],
      { cwd: projectRoot, entrypoint: join(repoRoot, "src", "index.ts") },
    );

    const payload = JSON.parse(result.stdout) as {
      success: boolean;
      finalOutput: string;
    };
    expect(result.exitCode).toBe(0);
    expect(payload.success).toBe(true);
    expect(payload.finalOutput).toBe("hello from cli");
    expect(result.stderr).not.toContain("loom: fatal error");
  });

  test("compiled session handles resize, exits, and non-TTY input", async () => {
    const binaryPath = await buildCompiledCli();
    const home = await mkdtemp(join(tmpdir(), "loom-first-run-home-"));
    const projectRoot = await mkdtemp(
      join(tmpdir(), "loom-first-run-project-"),
    );
    const backendUrl = "http://127.0.0.1:65535/v1";

    const escapeResult = await runCompiledSessionWithPty({
      binaryPath,
      cycleAgent: true,
      exitInput: "escape",
      firstRun: true,
      home,
      projectRoot,
      backendUrl,
      resize: true,
    });

    expect(escapeResult.exitCode).toBe(0);
    expect(escapeResult.resizeRendered).toBe(true);
    expect(escapeResult.cycledAgent).toBe(true);
    expect(escapeResult.output).toContain("OpenAI-compatible backend URL:");
    expect(escapeResult.output).toContain(
      "Unable to reach backend model endpoint",
    );
    expect(escapeResult.output).toContain("\u001B[?1049h");
    expect(escapeResult.output).toContain("\u001B[?1049l");
    expect(escapeResult.output).not.toContain(`${backendUrl}/models`);
    expect(escapeResult.output).not.toContain(
      'Active profile "default" does not define a default backend',
    );

    const written = await readFile(join(home, ".loom", "config.yaml"), "utf8");
    expect(written).toContain(`baseUrl: ${backendUrl}`);

    const ctrlCResult = await runCompiledSessionWithPty({
      binaryPath,
      cycleAgent: false,
      exitInput: "ctrl-c",
      firstRun: false,
      home,
      projectRoot,
      backendUrl,
      resize: false,
    });
    expect(ctrlCResult.exitCode).toBe(0);
    expect(ctrlCResult.output).toContain("\u001B[?1049h");
    expect(ctrlCResult.output).toContain("\u001B[?1049l");

    const pipedResult = await runCompiledNonTty({
      args: [],
      binaryPath,
      home,
      input: "/exit\n",
      projectRoot,
    });
    expect(pipedResult.exitCode).toBe(0);
    expect(pipedResult.stdout).toContain("Enter follow-up prompts.");
    expect(pipedResult.stdout).not.toContain("\u001B[?1049h");
    expect(pipedResult.stderr).not.toContain("loom: fatal error");

    const promptResult = await runCompiledNonTty({
      args: ["--prompt", "one-shot prompt"],
      binaryPath,
      home,
      input: "",
      projectRoot,
    });
    expect(promptResult.exitCode).toBe(0);
    expect(promptResult.stdout).toContain("Developer agent error:");
    expect(promptResult.stdout).not.toContain("Enter follow-up prompts.");
    expect(promptResult.stdout).not.toContain("\u001B[?1049h");
    expect(promptResult.stderr).not.toContain("loom: fatal error");
  }, 30_000);
});
