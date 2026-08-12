export function createRequestLifecycle() {
  let controller: AbortController | undefined
  let stopped = false

  return {
    begin(): AbortController {
      controller?.abort()
      controller = new AbortController()
      return controller
    },
    canContinue(request?: AbortController): boolean {
      return !stopped && (!request || (request === controller && !request.signal.aborted))
    },
    abort(): void {
      controller?.abort()
    },
    stop(): void {
      stopped = true
      controller?.abort()
    },
  }
}
