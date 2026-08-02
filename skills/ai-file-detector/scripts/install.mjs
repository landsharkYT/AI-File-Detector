import { appendFileSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_PATH = ".agents/skills/ai-file-detector";
const IGNORE_PATTERN = "/.agents/";

class InstallError extends Error {}

function parseArguments(values) {
  let root = process.cwd();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--root") {
      const next = values[index + 1];
      if (next === undefined) throw new InstallError("--root requires a path");
      root = resolve(next);
      index += 1;
    } else {
      throw new InstallError(`unknown argument ${JSON.stringify(value)}`);
    }
  }
  return root;
}

function git(cwd, args, input) {
  const result = spawnSync("git", args, {
    cwd,
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error !== undefined) throw new InstallError(`unable to execute Git: ${result.error.message}`);
  if (result.status === null) throw new InstallError("Git terminated without an exit status");
  return result;
}

function gitRoot(start) {
  const result = git(start, ["rev-parse", "--show-toplevel"]);
  if (result.status !== 0) throw new InstallError("target is not inside a Git repository");
  return result.stdout.trimEnd();
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

function sameFile(left, right, stats) {
  return stats.isFile() && !stats.isSymbolicLink() && readFileSync(left).equals(readFileSync(right));
}

function resources(sourceRoot) {
  const installedChecker = join(sourceRoot, "bin", "ai-file-detector.mjs");
  const checker = existsSync(installedChecker)
    ? installedChecker
    : resolve(sourceRoot, "..", "..", "dist", "ai-file-detector.js");
  return [
    { source: join(sourceRoot, "SKILL.md"), target: "SKILL.md" },
    { source: join(sourceRoot, "scripts", "install.mjs"), target: "scripts/install.mjs" },
    { source: checker, target: "bin/ai-file-detector.mjs" }
  ];
}

function ensureSafeTarget(root) {
  const directories = [".agents", ".agents/skills", SKILL_PATH, `${SKILL_PATH}/scripts`, `${SKILL_PATH}/bin`];
  for (const relativePath of directories) {
    const target = join(root, ...relativePath.split("/"));
    const stats = lstatIfPresent(target);
    if (stats === null) continue;
    if (stats.isSymbolicLink()) throw new InstallError(`refusing installation because ${relativePath} is a symbolic link`);
    if (!stats.isDirectory()) throw new InstallError(`refusing installation because ${relativePath} is not a directory`);
  }
}

function preflightResources(bundle, targetRoot) {
  const missing = [];
  for (const resource of bundle) {
    const target = join(targetRoot, resource.target);
    if (!existsSync(resource.source)) throw new InstallError(`skill bundle is incomplete: missing ${resource.target}`);
    const stats = lstatIfPresent(target);
    if (stats === null) {
      missing.push(resource);
    } else if (resolve(resource.source) !== resolve(target) && !sameFile(resource.source, target, stats)) {
      throw new InstallError(`refusing to overwrite ${SKILL_PATH}/${resource.target}`);
    }
  }
  return missing;
}

function ensureUntracked(root) {
  const result = git(root, ["ls-files", "-z", "--", ".agents"]);
  if (result.status !== 0) throw new InstallError("unable to inspect tracked .agents content");
  if (result.stdout.length > 0) throw new InstallError("refusing installation because .agents contains tracked content");
}

function governingIgnoreRule(root) {
  const probe = `${SKILL_PATH}/SKILL.md`;
  const result = git(root, ["check-ignore", "--no-index", "-v", "-z", "--stdin"], `${probe}\0`);
  if (result.status === 1) return null;
  if (result.status !== 0) throw new InstallError("unable to inspect existing ignore rules");
  const values = result.stdout.split("\0");
  if (values.length < 4) throw new InstallError("Git returned an invalid ignore-rule response");
  return values[2] ?? null;
}

function ensureIgnored(root) {
  const rule = governingIgnoreRule(root);
  if (rule !== null) {
    if (rule.startsWith("!")) throw new InstallError("refusing installation because a negation rule exposes the target skill");
    return "unchanged";
  }

  const gitignore = join(root, ".gitignore");
  const stats = lstatIfPresent(gitignore);
  if (stats === null) {
    writeFileSync(gitignore, `${IGNORE_PATTERN}\n`, { encoding: "utf8", flag: "wx" });
    return "created";
  }

  if (!stats.isFile() || stats.isSymbolicLink()) throw new InstallError("refusing installation because .gitignore is not a regular file");
  const content = readFileSync(gitignore);
  const prefix = content.length === 0 || content.at(-1) === 10 ? "" : "\n";
  appendFileSync(gitignore, `${prefix}${IGNORE_PATTERN}\n`, "utf8");
  return "appended";
}

function install() {
  const root = gitRoot(parseArguments(process.argv.slice(2)));
  const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = join(root, ...SKILL_PATH.split("/"));
  const bundle = resources(sourceRoot);
  ensureSafeTarget(root);
  const missing = preflightResources(bundle, targetRoot);
  ensureUntracked(root);
  const gitignore = ensureIgnored(root);

  for (const resource of missing) {
    const target = join(targetRoot, resource.target);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resource.source, target, constants.COPYFILE_EXCL);
  }

  const status = missing.length === 0 ? "already installed" : "installed";
  process.stdout.write(`AIFileDetector ${status} at ${SKILL_PATH}; .gitignore ${gitignore}.\n`);
}

try {
  install();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`AIFileDetector install error: ${message}\n`);
  process.exitCode = 2;
}
