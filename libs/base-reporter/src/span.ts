import {
  type Context,
  trace,
  ROOT_CONTEXT,
  type Span,
  type Tracer,
  type TimeInput,
} from '@opentelemetry/api';
import {getCiMetadata} from './ci';
import {getTracer, shutdown} from './tracing';
import {TEST_RUN_START_KEY, getTiming} from './utils';

const COMMON_SPAN_ATTRIBUTES_KEY = Symbol('commonSpanAttributes');
const TEST_FILLE_PATH_KEY = Symbol('testFilePath');

export type ExecutionStatus = 'passed' | 'failed' | 'skipped';

export type TestCase = (CompletedTestCase | NonExecutedTestCase) & {
  title: string;
  titlePath: string[];
};

export interface CompletedTestCase {
  status: 'passed' | 'failed';
  start: TimeInput;
  end: TimeInput;
  retries: number;
  retryReasons: string[];
  failureMessages: string[];
}

export interface NonExecutedTestCase {
  status: 'skipped';
}

export interface TestSuite {
  start: TimeInput;
  end: TimeInput;
  tests: TestCase[];
  path: string;
  status: ExecutionStatus;
}

export interface TestRun {
  start: TimeInput;
  end: TimeInput;
  suites: TestSuite[];
  status: ExecutionStatus;
}

export async function sendTestRun(run: TestRun): Promise<void> {
  createTestRunSpan(run);
  await shutdown();
}

export function createTestRunSpan(run: TestRun): Span[] {
  const tracer = getTracer();
  const parentContext = ROOT_CONTEXT;
  const {startTime, endTime} = getTiming(run, parentContext);
  const {spanAttributes} = getCiMetadata();

  const span = tracer.startSpan(
    'Test run',
    {
      startTime,
      attributes: {
        'execution.type': 'test.run',
        'execution.status': run.status,
        ...spanAttributes,
      },
    },
    parentContext,
  );
  const context = trace
    .setSpan(ROOT_CONTEXT, span)
    .setValue(TEST_RUN_START_KEY, run.start)
    .setValue(COMMON_SPAN_ATTRIBUTES_KEY, {...spanAttributes});
  const children = run.suites.map((suite) => createTestSuiteSpan(suite, context, tracer)).flat();
  span.end(endTime);
  return [span, ...children];
}

export function createTestSuiteSpan(
  suite: TestSuite,
  parentContext: Context,
  tracer: Tracer,
): Span[] {
  const {startTime, endTime} = getTiming(suite, parentContext);
  const commonSpanAttributes = parentContext.getValue(COMMON_SPAN_ATTRIBUTES_KEY) as Record<
    string,
    unknown
  >;
  const span = tracer.startSpan(
    suite.path,
    {
      startTime,
      attributes: {
        'execution.type': 'test.suite',
        'execution.status': suite.status,
        'test.suite.path': suite.path,
        ...commonSpanAttributes,
      },
    },
    parentContext,
  );

  const context = trace.setSpan(parentContext, span).setValue(TEST_FILLE_PATH_KEY, suite.path);
  const children = suite.tests.map((test) => createTestCaseSpan(test, context, tracer));
  span.end(endTime);
  return [span, ...children];
}

export function createTestCaseSpan(test: TestCase, parentContext: Context, tracer: Tracer): Span {
  const {startTime, endTime} = getTiming(test, parentContext);

  const span = tracer.startSpan(
    test.title,
    {
      startTime,
      attributes: getTestCaseSpanAttributes(test, parentContext),
    },
    parentContext,
  );
  span.end(endTime);
  return span;
}

function getTestCaseSpanAttributes(test: TestCase, parentContext: Context) {
  const commonSpanAttributes = parentContext.getValue(COMMON_SPAN_ATTRIBUTES_KEY) as Record<
    string,
    unknown
  >;
  const attributes = {
    'execution.type': 'test.case',
    'execution.status': test.status,
    'test.case.title': test.title,
    'test.case.titlePath': test.titlePath,
    'test.suite.path': parentContext.getValue(TEST_FILLE_PATH_KEY) as string,
    ...commonSpanAttributes,
  };
  if (test.status !== 'failed' && test.status !== 'passed') return attributes;
  return {
    ...attributes,
    'test.case.failure.messages': test.failureMessages,
    'test.case.retry.count': test.retries,
    'test.case.retry.reasons': test.retryReasons,
  };
}
