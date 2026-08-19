import { REQUIRED_NODE_MAJOR, REQUIRED_NODE_MINOR, REQUIRED_NODE_PATCH } from './constants.js';
import { ProductionError } from './errors.js';

export function parseNodeVersion(version: string): { major: number; minor: number; patch: number } {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
    throw new ProductionError('node_engine', `Unable to parse Node.js version "${version}".`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function nodeVersionSatisfies(
  version: string,
  minimum: { major: number; minor: number; patch: number } = {
    major: REQUIRED_NODE_MAJOR,
    minor: REQUIRED_NODE_MINOR,
    patch: REQUIRED_NODE_PATCH,
  },
): boolean {
  const parsed = parseNodeVersion(version);
  if (parsed.major !== minimum.major) {
    return parsed.major > minimum.major;
  }
  if (parsed.minor !== minimum.minor) {
    return parsed.minor > minimum.minor;
  }
  return parsed.patch >= minimum.patch;
}

export function assertNodeEngine(version: string = process.versions.node): void {
  if (!nodeVersionSatisfies(version)) {
    throw new ProductionError(
      'node_engine',
      `prod20 requires Node.js >= ${String(REQUIRED_NODE_MAJOR)}.${String(REQUIRED_NODE_MINOR)}.${String(REQUIRED_NODE_PATCH)}. Found ${version}.`,
    );
  }
}
