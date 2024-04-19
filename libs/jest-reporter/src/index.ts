import {join} from 'path';
import {
  type BaseOptions,
  init,
  sendTestRun,
  getPackageVersion,
  getVersionFromPackageJson,
} from '@allegoria/test-reporter-base';
import type {Config, Reporter, TestContext, AggregatedResult} from '@jest/reporters';
import type {Test, TestCaseResult} from '@jest/test-result';
import type {Circus} from '@jest/types';
import {mapTestRun} from './span';
import {storeStartedTest, updateEndTimer} from './storage';

export type AllegoriaReporterOptions = BaseOptions & {
  enabled?: boolean;
};

export default class AllegoriaReporter implements Reporter {
  protected readonly enabled: boolean;
  protected readonly globalConfig: Config.GlobalConfig;

  constructor(globalConfig: Config.GlobalConfig, options?: AllegoriaReporterOptions) {
    this.enabled = options?.enabled ?? true;
    this.globalConfig = globalConfig;
    if (!this.enabled) return;
    init({
      ...options,
      runner: {name: 'jest', version: getPackageVersion('jest')},
      reporter: {
        name: '@allegoria/jest-reporter',
        version: getVersionFromPackageJson(join(__dirname, '../package.json')),
      },
    });
  }

  onTestCaseStart(test: Test, testCase: Circus.TestCaseStartInfo): void {
    if (!this.enabled) return;
    storeStartedTest(test.path, testCase.fullName, {startedAt: testCase.startedAt ?? Date.now()});
  }

  onTestCaseResult(test: Test, testCaseResult: TestCaseResult): void {
    if (!this.enabled) return;
    if (testCaseResult.status === 'todo') return;
    updateEndTimer(test.path, testCaseResult);
  }

  public async onRunComplete(
    testContexts: Set<TestContext>,
    results: AggregatedResult,
  ): Promise<void> {
    if (!this.enabled) return;
    const testRun = mapTestRun(results, this.globalConfig);
    await sendTestRun(testRun);
  }
}
