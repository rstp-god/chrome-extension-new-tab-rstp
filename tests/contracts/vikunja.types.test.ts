/**
 * Compile-time contract test. `src/background/vikunja/messages.ts` declares
 * its own `VikunjaErrorKey` instead of importing `IntegrationErrorKey`, so
 * the worker never pulls in widget code (see `vikunjaBoundary.test.ts`).
 * This file is what keeps the two unions from drifting apart: the bridge's
 * keys must stay a subset of the widget's.
 */

import { describe, expectTypeOf, it } from 'vitest'

import type {
  TaskPayload,
  VIKUNJA_OPS,
  VikunjaErrorKey,
  VikunjaOp,
  VikunjaRequest,
  VikunjaResponse,
  VikunjaWire,
} from '@/background/vikunja/messages.ts'
import type { IntegrationErrorKey } from '@/widgets/Todo/integrations/index.ts'

describe('VikunjaErrorKey contract', () => {
  it('is assignable to the widget-side IntegrationErrorKey', () => {
    expectTypeOf<VikunjaErrorKey>().toMatchTypeOf<IntegrationErrorKey>()
  })

  it('enumerates exactly the keys the bridge can return', () => {
    expectTypeOf<VikunjaErrorKey>().toEqualTypeOf<
      | 'authInvalid'
      | 'network'
      | 'rateLimited'
      | 'notFound'
      | 'conflict'
      | 'permissionMissing'
      | 'unknown'
    >()
  })
})

describe('VikunjaRequest union', () => {
  it('the VIKUNJA_OPS runtime allowlist matches the op union exactly', () => {
    expectTypeOf<VikunjaOp>().toEqualTypeOf<(typeof VIKUNJA_OPS)[number]>()
  })

  it('VikunjaOp is the op field of the union', () => {
    expectTypeOf<VikunjaOp>().toEqualTypeOf<
      | 'ping'
      | 'connect'
      | 'listProjects'
      | 'listBuckets'
      | 'createBucket'
      | 'pull'
      | 'create'
      | 'update'
      | 'moveToBucket'
      | 'delete'
    >()
  })

  it('narrows per op: ping carries no credentials, the rest carry a wire cfg', () => {
    type Ping = Extract<VikunjaRequest, { op: 'ping' }>
    type Pull = Extract<VikunjaRequest, { op: 'pull' }>

    expectTypeOf<Ping>().toEqualTypeOf<{ type: 'vikunja'; op: 'ping' }>()
    expectTypeOf<Pull>().toEqualTypeOf<{
      type: 'vikunja'
      op: 'pull'
      cfg: VikunjaWire
      projectId: number
      viewId: number
      // Optional, so a caller that never heard of the snapshot cache gets the
      // cheap answer rather than a forced read of the user's instance.
      force?: boolean
    }>()
  })

  it('update takes a partial payload, create a full one', () => {
    type Create = Extract<VikunjaRequest, { op: 'create' }>
    type Update = Extract<VikunjaRequest, { op: 'update' }>

    expectTypeOf<Create['payload']>().toEqualTypeOf<TaskPayload>()
    expectTypeOf<Update['payload']>().toEqualTypeOf<Partial<TaskPayload>>()
  })
})

describe('VikunjaResponse<T> narrowing', () => {
  it('narrows value on ok=true and errorKey on ok=false', () => {
    function inspect(response: VikunjaResponse<number>) {
      if (response.ok) {
        expectTypeOf(response.value).toEqualTypeOf<number>()
        // @ts-expect-error errorKey is not present on the success branch
        void response.errorKey
      } else {
        expectTypeOf(response.errorKey).toEqualTypeOf<VikunjaErrorKey>()
        // @ts-expect-error value is not present on the failure branch
        void response.value
      }
    }
    void inspect
  })
})
