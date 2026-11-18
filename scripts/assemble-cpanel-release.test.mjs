import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assembleRelease, validateTree } from "./assemble-cpanel-release.mjs";

test("Linux release resolves sharp links and survives ZIP extraction", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "shiap-packaging-test-"));
  try {
    const source = path.join(root, "app");
    const work = path.join(root, "work");
    const standalone = path.join(source, ".next", "standalone");
    const dependency = path.join(standalone, "node_modules", ".store", "sharp");
    await mkdir(dependency, { recursive: true });
    await writeFile(path.join(dependency, "index.js"), "module.exports = 'linux sharp';");
    await symlink(".store/sharp", path.join(standalone, "node_modules", "sharp"));
    for (const name of ["server.js", "package.json", ".next/BUILD_ID"]) {
      await mkdir(path.dirname(path.join(standalone, name)), { recursive: true });
      await writeFile(path.join(standalone, name), name === "package.json" ? "{}" : "fixture");
    }
    await mkdir(path.join(source, "public", "logo"), { recursive: true });
    await writeFile(path.join(source, "public", "logo", "shiap-logo.png"), "fixture");
    await mkdir(path.join(source, ".next", "static"), { recursive: true });
    await writeFile(path.join(source, ".next", "static", "fixture.js"), "fixture");
    await mkdir(work);
    await assembleRelease(source, work);
    const sharp = path.join(work, "verified", "node_modules", "sharp");
    assert.ok((await lstat(sharp)).isDirectory());
    assert.equal(await readFile(path.join(sharp, "index.js"), "utf8"), "module.exports = 'linux sharp';");

    await symlink("../missing", path.join(standalone, "broken"));
    await assert.rejects(validateTree(standalone), /ENOENT/);
    await rm(path.join(standalone, "broken"));
    await symlink(".", path.join(standalone, "cycle"));
    await assert.rejects(validateTree(standalone), /cycle/);
    await rm(path.join(standalone, "cycle"));
    await symlink(source, path.join(standalone, "escape"));
    await assert.rejects(validateTree(standalone), /escapes/);
    await rm(path.join(standalone, "escape"));
    await writeFile(path.join(standalone, ".env.local"), "must not ship");
    await assert.rejects(validateTree(standalone), /Forbidden/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
