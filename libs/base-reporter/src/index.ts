export * from './span';
export * from './tracing';
export {getPackageVersion, getVersionFromPackageJson} from './utils';
export type {BaseOptions} from './utils';

import {initTracing, type RuntimeAttributes} from './tracing';
import {setOptions, type BaseOptions} from './utils';

export function init(options: BaseOptions & RuntimeAttributes) {
  setOptions(options);
  initTracing(options);
}
