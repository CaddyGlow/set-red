import { describe, expect, it } from 'vitest'
import {
  changedWorkspaceValues,
  getIncompatibleLinkCount,
  validateWorkspaceIdentity,
  validateWorkspaceSettings,
} from '../../app/utils/workspace-settings'

describe('workspace settings form utilities', () => {
  it('submits only fields whose values changed', () => {
    expect(changedWorkspaceValues(
      { name: 'Sink', slug: 'sink' },
      { name: 'Sink renamed', slug: 'sink' },
    )).toEqual({ name: 'Sink renamed' })
  })

  it('validates workspace identity with the shared contract', () => {
    expect(validateWorkspaceIdentity({ name: '', slug: 'Not Valid' })).toMatchObject({
      name: expect.any(String),
      slug: expect.any(String),
    })
    expect(validateWorkspaceIdentity({ name: 'Sink', slug: 'sink-links' })).toEqual({})
  })

  it('validates settings with the shared contract', () => {
    expect(validateWorkspaceSettings({ defaultSlugLength: 2 })).toHaveProperty('defaultSlugLength')
    expect(validateWorkspaceSettings({ webhookUrl: 'http://localhost/hook' })).toHaveProperty('webhookUrl')
    expect(validateWorkspaceSettings({ redirectStatusCode: 307 })).toEqual({})
  })

  it('reads incompatible-link counts from fetch and direct error data', () => {
    expect(getIncompatibleLinkCount({ data: { incompatibleLinks: 4 } })).toBe(4)
    expect(getIncompatibleLinkCount({ data: { data: { incompatibleLinks: 7 } } })).toBe(7)
    expect(getIncompatibleLinkCount({ data: {} })).toBeNull()
  })
})
