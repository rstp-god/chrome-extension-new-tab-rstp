/**
 * Compile-time contract tests. The bodies are intentionally light on
 * runtime assertions — the work happens in `expectTypeOf<...>()` which
 * Vitest evaluates at the type-checker level. The `it()` wrapper exists
 * so Vitest collects the file as part of the suite.
 */

import { TrelloIntegration } from '@/widgets/Todo/integrations/trello/index.ts'
import type { TrelloConfig } from '@/widgets/Todo/integrations/trello/types.ts'
import {
  getIntegrationDescriptor,
  TODO_STATUSES,
  type IntegrationDescriptor,
  type IntegrationErrorKey,
  type IntegrationOutcome,
  type IntegrationPushOp,
  type StatusListMapping,
  type TodoIntegration,
  type TodoStatus,
} from '@/widgets/Todo/integrations/index.ts'
import { describe, expectTypeOf, it } from 'vitest'

describe('TodoIntegration contract', () => {
  it('TrelloIntegration is structurally assignable to TodoIntegration', () => {
    expectTypeOf<TrelloIntegration>().toMatchTypeOf<TodoIntegration>()
  })

  it('IntegrationDescriptor.create returns a TodoIntegration', () => {
    const descriptor = {} as IntegrationDescriptor
    expectTypeOf(descriptor.create).returns.toMatchTypeOf<TodoIntegration>()
  })

  it('TrelloIntegration constructor takes a TrelloConfig', () => {
    expectTypeOf(TrelloIntegration).constructorParameters.toEqualTypeOf<[TrelloConfig]>()
  })
})

describe('IntegrationPushOp discriminated union narrowing', () => {
  it('narrows extra fields per kind', () => {
    type CreateOp = Extract<IntegrationPushOp, { kind: 'create' }>
    type UpdateOp = Extract<IntegrationPushOp, { kind: 'update' }>
    type DeleteOp = Extract<IntegrationPushOp, { kind: 'delete' }>
    type StatusOp = Extract<IntegrationPushOp, { kind: 'status' }>
    type ProjectOp = Extract<IntegrationPushOp, { kind: 'project' }>

    expectTypeOf<CreateOp>().toEqualTypeOf<{ kind: 'create' }>()
    expectTypeOf<UpdateOp>().toEqualTypeOf<{ kind: 'update' }>()
    expectTypeOf<DeleteOp>().toEqualTypeOf<{ kind: 'delete' }>()
    expectTypeOf<StatusOp>().toEqualTypeOf<{ kind: 'status'; previous: TodoStatus }>()
    expectTypeOf<ProjectOp>().toEqualTypeOf<{ kind: 'project'; previous: string | null }>()
  })

  it('TodoStatus union covers exactly the five known states', () => {
    expectTypeOf<TodoStatus>().toEqualTypeOf<
      'input' | 'inprogress' | 'struggle' | 'completed' | 'deleted'
    >()
  })
})

describe('StatusListMapping shape', () => {
  it('keys equal the TodoStatus union', () => {
    expectTypeOf<keyof StatusListMapping>().toEqualTypeOf<TodoStatus>()
  })

  it('values are arrays of list ids', () => {
    expectTypeOf<StatusListMapping['input']>().toEqualTypeOf<string[]>()
  })
})

describe('TODO_STATUSES tuple', () => {
  it('is a readonly tuple of all five TodoStatus values', () => {
    expectTypeOf<typeof TODO_STATUSES>().toEqualTypeOf<
      readonly ['input', 'inprogress', 'struggle', 'completed', 'deleted']
    >()
    expectTypeOf<(typeof TODO_STATUSES)[number]>().toEqualTypeOf<TodoStatus>()
  })
})

describe('IntegrationOutcome<T> narrowing', () => {
  it('narrows value on the ok=true branch and errorKey on ok=false', () => {
    function inspect(outcome: IntegrationOutcome<number>) {
      if (outcome.ok) {
        expectTypeOf(outcome.value).toEqualTypeOf<number>()
        // @ts-expect-error errorKey is not present on the success branch
        void outcome.errorKey
      } else {
        expectTypeOf(outcome.errorKey).toEqualTypeOf<IntegrationErrorKey>()
        // @ts-expect-error value is not present on the failure branch
        void outcome.value
      }
    }
    // satisfy unused-var rule
    void inspect
  })

  it('IntegrationErrorKey enumerates the known error categories', () => {
    expectTypeOf<IntegrationErrorKey>().toEqualTypeOf<
      | 'authInvalid'
      | 'network'
      | 'rateLimited'
      | 'notFound'
      | 'mappingIncomplete'
      | 'pushFailed'
      | 'pullFailed'
      | 'unknown'
    >()
  })
})

describe('getIntegrationDescriptor return type', () => {
  it('returns IntegrationDescriptor | null (forces null-handling at call sites)', () => {
    expectTypeOf(getIntegrationDescriptor).returns.toEqualTypeOf<IntegrationDescriptor | null>()
  })
})
