import { describe, expect, it } from 'vitest'
import { createRequestLifecycle } from '../../app/utils/request-lifecycle'

describe('request lifecycle', () => {
  it('invalidates replaced requests', () => {
    const lifecycle = createRequestLifecycle()
    const first = lifecycle.begin()
    const second = lifecycle.begin()

    expect(first.signal.aborted).toBe(true)
    expect(lifecycle.canContinue(first)).toBe(false)
    expect(lifecycle.canContinue(second)).toBe(true)
  })

  it('cannot continue or restart work after stop', () => {
    const lifecycle = createRequestLifecycle()
    const request = lifecycle.begin()
    lifecycle.stop()

    expect(request.signal.aborted).toBe(true)
    expect(lifecycle.canContinue()).toBe(false)
    expect(lifecycle.canContinue(request)).toBe(false)
  })
})
