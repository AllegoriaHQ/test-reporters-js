import {setGlobalErrorHandler} from '@opentelemetry/core';
import {OTLPTraceExporter as HttpOTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {OTLPTraceExporter as ProtoOTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-proto';
import {CompressionAlgorithm} from '@opentelemetry/otlp-exporter-base';
import type {OTLPExporterNodeConfigBase} from '@opentelemetry/otlp-exporter-base';
import {Resource} from '@opentelemetry/resources';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
  BatchSpanProcessor,
  RandomIdGenerator,
  type IdGenerator,
  type Tracer,
} from '@opentelemetry/sdk-trace-base';
import {
  SEMRESATTRS_PROCESS_RUNTIME_NAME,
  SEMRESATTRS_PROCESS_RUNTIME_VERSION,
} from '@opentelemetry/semantic-conventions';
import {getCiMetadata} from './ci';
import {getOptions} from './utils';

let succeedOnExportFailure = false;

export function onError(error: unknown): void {
  if (error instanceof AggregateError) {
    for (const err of error.errors) {
      onError(err);
    }
    return;
  }
  console.error('Failed to push test results to Allegoria');
  console.error(error);
  if (!succeedOnExportFailure) process.exit(1);
}

let tracer: Tracer | undefined;
let provider: BasicTracerProvider | undefined;

/** Returns a random ID generator, that can return deterministic trace IDs when running in CI context */
export function getIdGenerator(): IdGenerator {
  const {contextId} = getCiMetadata();
  const idGenerator = new RandomIdGenerator();
  if (contextId)
    idGenerator.generateTraceId = () => {
      return contextId;
    };
  return idGenerator;
}

export interface RuntimeAttributes {
  runner: {name: string; version?: string};
  reporter: {name: string; version?: string};
}

export function initTracing(attributes: RuntimeAttributes) {
  tracer = undefined;
  provider = undefined;
  const options = getOptions();
  succeedOnExportFailure = options?.succeedOnExportFailure ?? false;
  setGlobalErrorHandler(onError);
  const {resourceAttributes} = getCiMetadata();
  const idGenerator = getIdGenerator();

  provider = new BasicTracerProvider({
    idGenerator,
    resource: new Resource({
      [SEMRESATTRS_PROCESS_RUNTIME_NAME]: 'nodejs',
      [SEMRESATTRS_PROCESS_RUNTIME_VERSION]: process.versions.node,
      'test_runner.name': attributes.runner.name,
      'test_runner.version': attributes.runner.version,
      'test_runner.reporter.name': attributes.reporter.name,
      'test_runner.reporter.version': attributes.reporter.version,
      ...resourceAttributes,
    }),
  });
  const exporterConfig: OTLPExporterNodeConfigBase = {
    compression: CompressionAlgorithm.GZIP,
    ...options?.exporter,
  };
  const exporter = options?.useHttp
    ? new HttpOTLPTraceExporter(exporterConfig)
    : new ProtoOTLPTraceExporter(exporterConfig);
  provider.addSpanProcessor(new BatchSpanProcessor(exporter, options?.buffer));
  if (options?.debug) provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.register();
  tracer = provider.getTracer('allegoria');

  return {provider, exporter, tracer};
}

export function getTracer(): Tracer {
  if (!tracer) throw new Error('Tracing was not initialized');
  return tracer;
}

export async function shutdown() {
  try {
    await provider?.shutdown();
  } catch (error) {
    onError(error);
  }
}
