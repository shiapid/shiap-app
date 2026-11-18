import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "deployment", "cpanel");
const canonicalProjectRef = "sbomjhwmjmqteybsegdl";
const releaseEnvironment = process.env.SHIAP_RELEASE_ENVIRONMENT || "production";
const releaseFilename = process.env.SHIAP_RELEASE_FILENAME || `SHIAP-${releaseEnvironment.toUpperCase()}-RELEASE.zip`;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/i.test(releaseFilename)) {
  throw new Error("SHIAP_RELEASE_FILENAME must be a simple ZIP filename.");
}
const stage = await mkdtemp(path.join(tmpdir(), "shiap-cpanel-build-"));
const zipPath = path.join(outputDir, releaseFilename);
const tempZipPath = path.join(outputDir, `SHIAP-${releaseEnvironment.toUpperCase()}-RELEASE-${Date.now()}.tmp.zip`);
const depsVolume = `shiap-cpanel-deps-${process.pid}-${Date.now()}`;
const buildVolume = `${depsVolume}-build`;
const releaseVolume = `${depsVolume}-release`;
const createdVolumes = [];

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

async function smokeTestPassengerEntry(cwd, env) {
  const net = await import("node:net");
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));

  const runtimeMount = `type=volume,source=${releaseVolume},target=/release-work`;
  const container = depsVolume + "-smoke";
  const child = spawn("docker.exe", [
    "run", "--rm", "--name", container, "--platform", "linux/amd64", "-p", `127.0.0.1:${port}:${port}`,
    "--mount", runtimeMount, "--workdir", "/release-work/verified", "--env", "PORT=" + port,
    "--env", "HOSTNAME=0.0.0.0", "--env", "NODE_ENV=production",
    "--env", "NEXT_PUBLIC_SUPABASE_URL", "--env", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "--env", "NEXT_PUBLIC_SHIAP_DEMO_MODE",
    "node:24.22.2-slim", "node", "app.js",
  ], { cwd, env, stdio: "ignore", shell: false });
  try {
    const deadline = Date.now() + 60_000;
    let lastError;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Passenger entry process exited early with code ${child.exitCode}.`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(5_000) });
        if (!response.ok) throw new Error(`Passenger entry smoke test returned HTTP ${response.status}.`);
        await response.body?.cancel();
        const imageResponse = await fetch(`http://127.0.0.1:${port}/_next/image?url=%2Flogo%2Fshiap-logo.png&w=640&q=75`, { signal: AbortSignal.timeout(10_000) });
        if (!imageResponse.ok) throw new Error(`Linux image optimizer smoke test returned HTTP ${imageResponse.status}.`);
        await imageResponse.body?.cancel();
        for (const route of ["/explore", "/trip", "/stay", "/rental", "/activities", "/shinema", "/custom-trip", "/booking", "/login", "/register", "/forgot-password", "/reset-password"]) {
          const routeResponse = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(15_000) });
          if (!routeResponse.ok) throw new Error(`Passenger route smoke test for ${route} returned HTTP ${routeResponse.status}.`);
          await routeResponse.body?.cancel();
        }
        console.log("LINUX_PASSENGER_AND_SHARP_SMOKE_OK");
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
    throw new Error(`Passenger entry did not become healthy within 60 seconds (${lastError?.name ?? "startup timeout"}).`);
  } finally {
    spawnSync("docker.exe", ["rm", "-f", container], { cwd, stdio: "ignore", shell: false });
    child.kill();
  }
}

try {
  // Release builds only accept configuration injected in memory by the
  // authenticated deployment script. Developer .env files are never read.
  const cloudUrl = process.env.SHIAP_RELEASE_SUPABASE_URL;
  const publishableKey = process.env.SHIAP_RELEASE_SUPABASE_PUBLISHABLE_KEY;
  const demoMode = process.env.SHIAP_RELEASE_DEMO_MODE === "true";
  if (!cloudUrl || !publishableKey) {
    throw new Error("Release Supabase configuration is missing. Run the authenticated cPanel deployment script to supply it securely.");
  }
  const expectedProjectRef = process.env.SHIAP_EXPECTED_SUPABASE_PROJECT_REF;
  if (!/^[a-z0-9]{20}$/.test(expectedProjectRef || "")) {
    throw new Error("A valid expected Supabase project reference is required.");
  }
  if (!new Set(["production", "staging"]).has(releaseEnvironment)) {
    throw new Error("SHIAP_RELEASE_ENVIRONMENT must be production or staging.");
  }
  if (releaseEnvironment === "production" && expectedProjectRef !== canonicalProjectRef) {
    throw new Error("Refusing production build: the expected Supabase project must be the canonical Shiap App project.");
  }
  if (releaseEnvironment === "staging" && expectedProjectRef === canonicalProjectRef) {
    throw new Error("Refusing staging build: staging must use a separate Supabase project.");
  }
  if (releaseEnvironment === "staging" && process.env.SHIAP_RELEASE_DEMO_MODE !== "true") {
    throw new Error("Staging builds must keep demo mode enabled.");
  }
  const parsedUrl = new URL(cloudUrl);
  if (parsedUrl.protocol !== "https:" || /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(parsedUrl.hostname)) {
    throw new Error("Refusing to package a build unless NEXT_PUBLIC_SUPABASE_URL is a non-local HTTPS Cloud endpoint.");
  }
  if (/^(sb_secret_|service_role)/i.test(publishableKey)) {
    throw new Error("Refusing to embed a server secret in a NEXT_PUBLIC_ variable.");
  }
  if (parsedUrl.hostname.split(".")[0] !== expectedProjectRef) {
    throw new Error("Refusing to build: the Supabase URL does not match SHIAP_EXPECTED_SUPABASE_PROJECT_REF.");
  }
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error("Refusing release build without a Supabase publishable key.");
  }

  await mkdir(outputDir, { recursive: true });
  try {
    await stat(zipPath);
    throw new Error("A production ZIP already exists at the output path; move it aside manually to preserve it before rebuilding.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const files = ["package.json", "package-lock.json", "next.config.ts", "postcss.config.mjs", "tsconfig.json", "proxy.ts"];
  for (const file of files) await cp(path.join(root, file), path.join(stage, file));
  for (const dir of ["src", "public"]) {
    await cp(path.join(root, dir), path.join(stage, dir), {
      recursive: true,
      filter: (source) => {
        const name = path.basename(source);
        return !/(?:^\.env(?:\.|$)|\.bak(?:[.-]|$)|\.(?:tmp|log|zip|tsbuildinfo)$|^\.DS_Store$|^Thumbs\.db$)/i.test(name);
      },
    });
  }

  await mkdir(path.join(stage, "scripts"));
  for (const file of ["assemble-cpanel-release.mjs", "assemble-cpanel-release.test.mjs"]) {
    await cp(path.join(root, "scripts", file), path.join(stage, "scripts", file));
  }

  const stagedEnvFiles = (await readdir(stage, { withFileTypes: true })).filter((entry) => entry.name.startsWith(".env"));
  if (stagedEnvFiles.length) throw new Error("Build staging unexpectedly contains environment files.");

  const buildEnv = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: cloudUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    NEXT_PUBLIC_SHIAP_DEMO_MODE: String(demoMode),
    NEXT_PUBLIC_SHIAP_ENVIRONMENT: releaseEnvironment,
    NODE_ENV: "development",
  };
  delete buildEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete buildEnv.SUPABASE_SERVICE_ROLE_KEY;

  const dockerMount = `type=bind,source=${stage.replaceAll("\\", "/")},target=/app`;
  for (const volume of [depsVolume, buildVolume, releaseVolume]) {
    run("docker.exe", ["volume", "create", volume], root, process.env);
    createdVolumes.push(volume);
  }
  const buildMount = `type=volume,source=${buildVolume},target=/app/.next`;
  const releaseMount = `type=volume,source=${releaseVolume},target=/release-work`;
  const nodeModulesMount = `type=volume,source=${depsVolume},target=/app/node_modules`;
  run("docker.exe", ["run", "--rm", "--platform", "linux/amd64", "--mount", dockerMount, "--mount", nodeModulesMount, "--mount", buildMount, "--workdir", "/app", "--env", "NODE_ENV=development", "--env", "NEXT_PUBLIC_SUPABASE_URL", "--env", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "--env", "NEXT_PUBLIC_SHIAP_DEMO_MODE", "--env", "NEXT_PUBLIC_SHIAP_ENVIRONMENT", "node:24.22.2-slim", "npm", "ci", "--no-audit", "--no-fund"], root, buildEnv);
  buildEnv.NODE_ENV = "production";
  run("docker.exe", ["run", "--rm", "--platform", "linux/amd64", "--mount", dockerMount, "--mount", nodeModulesMount, "--mount", buildMount, "--workdir", "/app", "--env", "NODE_ENV=production", "--env", "NEXT_TELEMETRY_DISABLED=1", "--env", "NEXT_PUBLIC_SUPABASE_URL", "--env", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "--env", "NEXT_PUBLIC_SHIAP_DEMO_MODE", "--env", "NEXT_PUBLIC_SHIAP_ENVIRONMENT", "node:24.22.2-slim", "npm", "run", "build"], root, buildEnv);

  // Generated dependencies and ZIP extraction stay on Linux volumes.
  // Only the final ZIP file crosses the Windows bind mount.
  run("docker.exe", ["run", "--rm", "--platform", "linux/amd64",
    "--mount", dockerMount, "--mount", buildMount, "--mount", releaseMount,
    "--workdir", "/app", "node:24.22.2-slim", "sh", "-ec",
    "apt-get update -qq && apt-get install -y -qq --no-install-recommends zip unzip >/dev/null && node --test scripts/assemble-cpanel-release.test.mjs && node scripts/assemble-cpanel-release.mjs",
  ], root, buildEnv);
  await smokeTestPassengerEntry(root, buildEnv);
  const outputMount = `type=bind,source=${outputDir.replaceAll("\\", "/")},target=/output`;
  run("docker.exe", ["run", "--rm", "--platform", "linux/amd64",
    "--mount", releaseMount, "--mount", outputMount, "node:24.22.2-slim",
    "node", "-e", "require('node:fs').copyFileSync('/release-work/release.zip', process.argv[1], require('node:fs').constants.COPYFILE_EXCL)",
    "/output/" + path.basename(tempZipPath),
  ], root, process.env);

  const powershell = process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell";
  const verifyZip = `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $z = [System.IO.Compression.ZipFile]::OpenRead('${tempZipPath.replaceAll("'", "''")}'); try { $names = @($z.Entries | ForEach-Object { $_.FullName }); $required = @('app.js','server.js','package.json','public/logo/shiap-logo.png'); foreach ($r in $required) { if ($names -notcontains $r) { throw "Required runtime file missing: $r" } }; if (-not ($names | Where-Object { $_ -like '.next/static/*' })) { throw 'Next static assets missing from ZIP.' }; if ($names | Where-Object { $_ -match '(^|/)\\.env([^/]*$|/)|(^|/)\\.git(/|$)|\\.bak$|(^|/)(archive|audit-report)/' }) { throw 'ZIP contains a forbidden environment, git, backup, or local archive path.' } } finally { $z.Dispose() }; Write-Output 'ZIP_CONTENT_OK'`;
  const check = spawnSync(powershell, ["-NoProfile", "-Command", verifyZip], { cwd: root, env: process.env, encoding: "utf8", shell: false });
  if (check.error || check.status !== 0 || !check.stdout.includes("ZIP_CONTENT_OK")) {
    throw new Error("Production ZIP validation failed; inspect local packaging output without sharing environment values.");
  }
  await rename(tempZipPath, zipPath);
  console.log("Production release ZIP created:", zipPath);
  console.log("Build stage contained no .env files. Supabase endpoint was validated; no endpoint or key values were printed.");
} finally {
  await rm(stage, { recursive: true, force: true });
  await rm(tempZipPath, { force: true });
  for (const volume of createdVolumes.reverse()) {
    spawnSync("docker.exe", ["volume", "rm", volume], { cwd: root, stdio: "ignore", shell: false });
  }
}
