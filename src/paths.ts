import { relative, resolve, sep } from "node:path";

export function asciiLower(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    result += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : value[index];
  }
  return result;
}

export function normalizeRepositoryPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/$/u, "");
}

export function repositoryRelative(root: string, value: string): string | null {
  const result = normalizeRepositoryPath(relative(root, resolve(value)));
  if (result === "" || result === ".." || result.startsWith("../")) return null;
  return result;
}

export function nativePath(root: string, repositoryPath: string): string {
  return resolve(root, ...repositoryPath.split("/"));
}

export function displayPath(value: string): string {
  return JSON.stringify(value);
}

export function pathStartsWith(value: string, prefix: string): boolean {
  const loweredValue = asciiLower(value);
  const loweredPrefix = asciiLower(prefix);
  return loweredValue === loweredPrefix || loweredValue.startsWith(`${loweredPrefix}/`);
}

export function platformPath(value: string): string {
  return sep === "/" ? value : value.replaceAll("/", sep);
}
