import {
  getIntegrationDescriptor,
  todoIntegrationRegistry,
} from '@/widgets/Todo/integrations/index.ts'
import { describe, expect, it } from 'vitest'

/**
 * The lookup key is the persisted `integration.name` — it reaches this
 * function straight from `chrome.storage`, so a hand-edited or corrupted
 * record must not be able to make the registry hand out an object that is
 * not a descriptor.
 */
describe('todoIntegrationRegistry lookup', () => {
  it('resolves a registered integration', () => {
    expect(getIntegrationDescriptor('trello')?.name).toBe('trello')
    expect(getIntegrationDescriptor('vikunja')?.name).toBe('vikunja')
  })

  it('picks up every bundled integration through the eager glob', () => {
    expect(Object.keys(todoIntegrationRegistry).sort()).toEqual(['trello', 'vikunja'])
  })

  it('returns null for names that are not registered', () => {
    expect(getIntegrationDescriptor('notrello')).toBeNull()
    expect(getIntegrationDescriptor(null)).toBeNull()
    expect(getIntegrationDescriptor(undefined)).toBeNull()
    expect(getIntegrationDescriptor('')).toBeNull()
  })

  it('returns null for prototype keys instead of an Object.prototype member', () => {
    expect(getIntegrationDescriptor('constructor')).toBeNull()
    expect(getIntegrationDescriptor('__proto__')).toBeNull()
    expect(getIntegrationDescriptor('toString')).toBeNull()
    expect(getIntegrationDescriptor('hasOwnProperty')).toBeNull()
  })

  it('has no prototype to inherit those keys from in the first place', () => {
    expect(Object.getPrototypeOf(todoIntegrationRegistry)).toBeNull()
  })
})
