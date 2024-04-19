import {readFileSync} from 'fs';

export function getPackageVersion(packageName: string): string | undefined {
  try {
    const packagePath = require.resolve(`${packageName}/package.json`);
    return getVersionFromPackageJson(packagePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'MODULE_NOT_FOUND') {
      console.warn(`Could not determine version of ${packageName}: ${error.message}`);
      return;
    }
    throw error;
  }
}

export function getVersionFromPackageJson(path: string): string | undefined {
  const packageJson = JSON.parse(readFileSync(path, 'utf8'));
  return packageJson.version;
}
