import {join} from 'node:path';
import {
  init,
  type BaseOptions,
  sendTestRun,
  getVersionFromPackageJson,
  getPackageVersion,
} from '@allegoria/test-reporter-base';
import type {Reporter, File, Vitest} from 'vitest';
import {createDataFromFile} from './result';

export type AllegoriaReporterOptions = BaseOptions & {
  enabled?: boolean;
};

export default class AllegoriaReporter implements Reporter {
  start: number;
  enabled: boolean;
  context: Vitest | undefined;

  constructor(options?: AllegoriaReporterOptions) {
    this.start = Date.now();
    this.enabled = options?.enabled ?? true;
    if (!this.enabled) return;
    init({
      ...options,
      runner: {name: 'vitest', version: getPackageVersion('vitest')},
      reporter: {
        name: '@allegoria/vitest-reporter',
        version: getVersionFromPackageJson(join(__dirname, '../package.json')),
      },
    });
  }

  onInit(context: Vitest) {
    this.context = context;
  }

  async onFinished(files: File[] = []): Promise<void> {
    if (!this.enabled) return;
    const context = this.context;
    if (!context) throw new Error(`Vitest context not found`);
    const end = Date.now();
    const suites = files.map((file) => createDataFromFile(file, context));
    await sendTestRun({
      start: this.start,
      end,
      suites,
      status: suites.some((suite) => suite.status === 'failed') ? 'failed' : 'passed',
    });
  }
}
