import { cp, lstat, mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " failed with status " + result.status);
}

function forbidden(name) {
  return /^(?:\.env.*|\.git|archive|audit-report)$|\.(?:bak(?:[.-].*)?|tmp|log|zip|tsbuildinfo)$|^\.DS_Store$|^Thumbs\.db$/i.test(name);
}

// Validate logical paths and resolved targets before following Linux links.
// Directory ancestors detect cycles while allowing shared dependency targets.
export async function validateTree(root) {
  const base = await realpath(root);
  let files = 0;
  async function visit(entry, ancestors) {
    if (forbidden(path.basename(entry))) throw new Error("Forbidden release path: " + entry);
    const resolved = await realpath(entry);
    const relative = path.relative(base, resolved);
    if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
      throw new Error("Release symlink escapes its root: " + entry);
    }
    if (relative.split(path.sep).some(forbidden)) throw new Error("Forbidden release target: " + entry);
    const info = await lstat(resolved);
    if (info.isDirectory()) {
      if (ancestors.has(resolved)) throw new Error("Release symlink cycle: " + entry);
      const next = new Set(ancestors).add(resolved);
      for (const name of await readdir(entry)) await visit(path.join(entry, name), next);
    } else if (info.isFile()) {
      files += 1;
    } else {
      throw new Error("Unsupported release entry: " + entry);
    }
  }
  await visit(base, new Set());
  return files;
}

export async function assembleRelease(source, work) {
  const standalone = path.join(source, ".next", "standalone");
  const release = path.join(work, "release");
  const archive = path.join(work, "release.zip");
  const verified = path.join(work, "verified");
  for (const tree of [standalone, path.join(source, "public"), path.join(source, ".next", "static")]) {
    await validateTree(tree);
  }
  // Runs entirely on Linux. Emit regular files for relocatable cPanel unzip.
  await cp(standalone, release, { recursive: true, dereference: true });
  await cp(path.join(source, "public"), path.join(release, "public"), { recursive: true, dereference: true });
  await cp(path.join(source, ".next", "static"), path.join(release, ".next", "static"), { recursive: true, dereference: true });
  await mkdir(path.join(release, "tmp"), { recursive: true });
  await mkdir(path.join(release, "logs"), { recursive: true });
  await writeFile(path.join(release, "app.js"), '// cPanel Passenger entry point for Next.js standalone.\n// Passenger supplies/intercepts the HTTP port; do not hardcode PORT here.\nprocess.env.NODE_ENV = "production";\nprocess.env.HOSTNAME ||= "0.0.0.0";\nrequire("./server.js");\n');
  await writeFile(path.join(release, "tmp", "restart.txt"), "");
  for (const required of ["app.js", "server.js", "package.json", ".next/BUILD_ID", "public/logo/shiap-logo.png"]) {
    if (!(await lstat(path.join(release, required))).isFile()) throw new Error("Missing runtime file: " + required);
  }
  if (!(await readdir(path.join(release, ".next", "static"))).length) throw new Error("Next static assets are empty.");
  const fileCount = await validateTree(release);
  run("zip", ["-q", "-r", archive, ...await readdir(release)], release);
  run("unzip", ["-tq", archive], work);
  await mkdir(verified);
  run("unzip", ["-q", archive, "-d", verified], work);
  if (await validateTree(verified) !== fileCount) throw new Error("Extracted archive file count mismatch.");
  console.log("LINUX_RELEASE_ASSEMBLY_OK");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await assembleRelease("/app", "/release-work");
}
