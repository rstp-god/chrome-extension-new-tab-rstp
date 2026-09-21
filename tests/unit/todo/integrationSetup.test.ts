import { getProjectPolicy, getSetupStep, isReadyToSync } from '@/widgets/Todo/integrations/setup.ts'
import { describe, expect, it, vi } from 'vitest'

import type { IntegrationDescriptor, StatusListMapping } from '@/widgets/Todo/integrations/types.ts'
import type { IntegrationState } from '@/widgets/Todo/store/store.ts'

/**
 * The three questions the widget asks about a connection, and the two ways
 * each of them is answered: the rule the widget has always had (a scope and a
 * mapping on the slice, an optional changeable project) and the descriptor's
 * own hook, which wins whenever it exists.
 *
 * The descriptors here are hand-built rather than the real ones: what is
 * tested is the fallback and the delegation, and a real descriptor can only
 * demonstrate one of the two.
 */

const MAPPING: StatusListMapping = {
  input: ['1'],
  inprogress: ['2'],
  struggle: ['2'],
  completed: ['3'],
  deleted: ['2'],
}

/** A Trello slice — the shape whose scope and mapping live on the slice. */
function slice(overrides: Partial<Extract<IntegrationState, { name: 'trello' }>> = {}) {
  return {
    name: 'trello',
    config: { apiKey: 'k', token: 't', boardId: 'board-1' },
    boardName: 'Board',
    lists: [],
    projects: [],
    mapping: MAPPING,
    lastSyncAt: null,
    ...overrides,
  } as IntegrationState
}

/** The smallest descriptor these helpers can be asked about. */
function descriptor(overrides: Partial<IntegrationDescriptor> = {}): IntegrationDescriptor {
  return {
    name: 'fake',
    titleI18nKey: 'x',
    descriptionI18nKey: 'x',
    ConnectForm: () => null,
    create: () => ({}) as never,
    getScope: (config) => {
      const { boardId } = config as { boardId: string | null }
      return boardId ? { boardId } : null
    },
    withScope: (config) => config,
    ownsRef: () => true,
    ...overrides,
  }
}

describe('getSetupStep — the default rule', () => {
  it('asks for a scope while the config names none', () => {
    expect(
      getSetupStep(descriptor(), slice({ config: { apiKey: 'k', token: 't', boardId: null } })),
    ).toBe('board')
  })

  it('asks for a mapping once there is a scope', () => {
    expect(getSetupStep(descriptor(), slice({ mapping: null }))).toBe('mapping')
  })

  it('lands on the summary once both are there', () => {
    expect(getSetupStep(descriptor(), slice())).toBe('summary')
  })

  it('sends an integration with no descriptor back to the picker step', () => {
    // An integration removed from the build, or a hand-edited `name`: there
    // is no scope to speak of, and `board` is the step the user can act on.
    expect(getSetupStep(null, slice())).toBe('board')
  })
})

describe('getSetupStep — the descriptor’s own answer', () => {
  it('is used instead of the default rule, whatever the slice says', () => {
    const getStep = vi.fn(() => 'mapping' as const)
    const integration = slice()

    // Scope and mapping both present, so the default rule would say
    // `summary`.
    expect(getSetupStep(descriptor({ getSetupStep: getStep }), integration)).toBe('mapping')
    expect(getStep).toHaveBeenCalledWith(integration)
  })
})

describe('isReadyToSync — the default rule', () => {
  it('needs both a scope and a mapping', () => {
    expect(isReadyToSync(descriptor(), slice())).toBe(true)
    expect(isReadyToSync(descriptor(), slice({ mapping: null }))).toBe(false)
    expect(
      isReadyToSync(descriptor(), slice({ config: { apiKey: 'k', token: 't', boardId: null } })),
    ).toBe(false)
  })

  it('is never ready without a descriptor to sync through', () => {
    expect(isReadyToSync(null, slice())).toBe(false)
  })
})

describe('isReadyToSync — the setup step, by another name', () => {
  it('follows the descriptor’s step: summary means ready, anything else does not', () => {
    // One hook, not two that must agree: a connection still on the board or
    // the mapping screen is exactly one a sync cannot do anything with.
    const integration = slice({ mapping: null })

    expect(isReadyToSync(descriptor({ getSetupStep: () => 'summary' }), integration)).toBe(true)
    expect(isReadyToSync(descriptor({ getSetupStep: () => 'mapping' }), integration)).toBe(false)
    expect(isReadyToSync(descriptor({ getSetupStep: () => 'board' }), slice())).toBe(false)
  })
})

describe('getProjectPolicy', () => {
  it('defaults to an optional, changeable project with no default id', () => {
    const policy = getProjectPolicy(descriptor())

    expect(policy.required).toBe(false)
    expect(policy.changeable).toBe(true)
    expect(policy.defaultId({ anything: true })).toBeNull()
  })

  it('answers the same object every time, so a component may depend on it', () => {
    expect(getProjectPolicy(descriptor())).toBe(getProjectPolicy(null))
  })

  it('hands back the descriptor’s policy when it has one', () => {
    const projectPolicy = {
      required: true,
      defaultId: (config: unknown) => String((config as { boardId: string }).boardId),
      changeable: false,
    }

    expect(getProjectPolicy(descriptor({ projectPolicy }))).toBe(projectPolicy)
  })
})
