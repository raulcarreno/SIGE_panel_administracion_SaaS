import { isHetznerRuntime } from './runtimeTarget.js'
import { defaultKubeClient } from './kubeApiClient.js'
import { composeRuntimeClient } from './composeClient.js'

export function defaultRuntimeClient() {
  return isHetznerRuntime() ? composeRuntimeClient : defaultKubeClient
}
