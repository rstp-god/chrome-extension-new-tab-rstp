import { describe, expect, it } from 'vitest'

import { statusForContainerId } from '@/widgets/Todo/integrations/statusMapping.ts'
import {
  htmlToText,
  isReservedLabel,
  labelToProject,
  localIdForTask,
  textToHtml,
  vikunjaTaskToTodo,
} from '@/widgets/Todo/integrations/vikunja/mapping.ts'
import { vikunjaHueFor } from '@/widgets/Todo/integrations/vikunja/projectStyles.ts'
import { DEFAULT_PROJECT_PILL_CLASS } from '@/widgets/Todo/utils/projectPillPalette.ts'

import type { VikunjaPulledTask } from '@/background/vikunja/messages.ts'
import type {
  RemoteTaskRef,
  StatusListMapping,
  TodoStatus,
} from '@/widgets/Todo/integrations/types.ts'
import type { VikunjaTaskContext } from '@/widgets/Todo/integrations/vikunja/mapping.ts'

const MAPPING: StatusListMapping = {
  input: ['1'],
  inprogress: ['2'],
  struggle: ['5'],
  completed: ['3'],
  deleted: ['6'],
}

function pulled(overrides: Partial<VikunjaPulledTask> = {}): VikunjaPulledTask {
  return {
    id: 4,
    identifier: '#3',
    title: 'Probe',
    description: '',
    done: false,
    doneAt: null,
    bucketId: 1,
    created: '2026-09-20T17:00:00+03:00',
    updated: '2026-09-20T17:30:00+03:00',
    labelIds: [],
    ...overrides,
  }
}

function context(overrides: Partial<VikunjaTaskContext> = {}): VikunjaTaskContext {
  return {
    mapping: MAPPING,
    knownRefs: {},
    knownStatuses: {},
    flat: false,
    projectIds: new Set<string>(),
    ...overrides,
  }
}

function vikunjaRef(taskId: number): RemoteTaskRef {
  return { taskId, identifier: `#${taskId}`, bucketId: 1, updated: '2026-01-01T00:00:00.000Z' }
}

describe('statusForContainerId', () => {
  it('resolves a bucket that is mapped', () => {
    expect(statusForContainerId('2', MAPPING)).toBe('inprogress')
  })

  it('falls back to input for a bucket nobody mapped', () => {
    // A column the user forgot about should read as incoming work, not
    // disappear from the widget.
    expect(statusForContainerId('99', MAPPING)).toBe('input')
  })

  it('prefers the earlier status when a bucket was somehow mapped twice', () => {
    const doubled: StatusListMapping = { ...MAPPING, struggle: ['1', '5'] }
    expect(statusForContainerId('1', doubled)).toBe('input')
  })
})

describe('htmlToText', () => {
  it('turns block ends into line breaks and drops the tags', () => {
    expect(htmlToText('<p>first</p><p>second</p>')).toBe('first\n\nsecond')
    expect(htmlToText('<p>one<br>two</p>')).toBe('one\ntwo')
    expect(htmlToText('<div>a</div><div>b</div>')).toBe('a\nb')
    expect(htmlToText('<ul><li>a</li><li>b</li></ul>')).toBe('a\nb')
  })

  it('decodes entities, including numeric ones', () => {
    expect(htmlToText('<p>a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;&nbsp;f</p>')).toBe(
      'a & b <c> "d" \'e\' f',
    )
    expect(htmlToText('&#1055;&#x440;&#x438;')).toBe('При')
  })

  it('decodes in a single pass so an escaped entity stays escaped', () => {
    // The user typed `&lt;` literally; Vikunja stored `&amp;lt;`.
    expect(htmlToText('<p>&amp;lt;</p>')).toBe('&lt;')
  })

  it('leaves a broken entity alone instead of throwing', () => {
    expect(htmlToText('&#999999999; &#xD800; &notanentity;')).toBe(
      '&#999999999; &#xD800; &notanentity;',
    )
  })

  it('collapses runs of blank lines and trims', () => {
    expect(htmlToText('<p></p><p>a</p><p></p><p></p><p>b</p><p></p>')).toBe('a\n\nb')
  })

  it('answers an empty string for an empty description', () => {
    expect(htmlToText('')).toBe('')
  })
})

describe('textToHtml', () => {
  it('wraps paragraphs and escapes the text', () => {
    expect(textToHtml('a & b\n\n<c>')).toBe('<p>a &amp; b</p><p>&lt;c&gt;</p>')
  })

  it('renders a single newline as <br>', () => {
    expect(textToHtml('one\ntwo')).toBe('<p>one<br>two</p>')
  })

  it('answers an empty string for blank input', () => {
    expect(textToHtml('   \n  ')).toBe('')
  })

  it.each([
    'plain text',
    'one\ntwo',
    'a\n\nb',
    'a & b < c > d "e" \'f\'',
    'multi\nline\n\nwith a gap',
  ])('round-trips %j', (text) => {
    expect(htmlToText(textToHtml(text))).toBe(text)
  })
})

describe('labels', () => {
  it.each(['energy:1', 'ENERGY:3', ' mood:low', 'mood:'])('treats %s as reserved', (title) => {
    expect(isReservedLabel(title)).toBe(true)
  })

  it.each(['work', 'energetic', 'moody', 'my energy:1'])('leaves %s alone', (title) => {
    expect(isReservedLabel(title)).toBe(false)
  })

  it('maps a label to a Project with a pill class', () => {
    expect(labelToProject({ id: 7, title: 'work', hexColor: '0ead69' })).toEqual({
      id: '7',
      name: 'work',
      pillClassName: expect.stringContaining('emerald'),
    })
  })

  it('falls back to the muted pill for a label with no colour', () => {
    expect(labelToProject({ id: 7, title: 'work', hexColor: null }).pillClassName).toBe(
      DEFAULT_PROJECT_PILL_CLASS,
    )
  })
})

describe('vikunjaHueFor', () => {
  it.each([
    // The three colours the recon run actually saw on the instance.
    ['efbdeb', 'pink'],
    ['0ead69', 'green'],
    ['ff006e', 'pink'],
    ['#ff0000', 'red'],
    ['ffa500', 'orange'],
    ['ffff00', 'yellow'],
    ['00bfff', 'sky'],
    ['1d4ed8', 'blue'],
    ['7c3aed', 'purple'],
    ['#0f0', 'green'],
  ])('maps %s to %s', (hex, hue) => {
    expect(vikunjaHueFor(hex)).toBe(hue)
  })

  it.each(['808080', '111111', 'eeeeee'])('treats the greyscale %s as black', (hex) => {
    expect(vikunjaHueFor(hex)).toBe('black')
  })

  it.each([null, '', 'not-a-colour', '#12345'])('answers null for %j', (hex) => {
    expect(vikunjaHueFor(hex)).toBeNull()
  })
})

describe('vikunjaTaskToTodo — identity', () => {
  it('derives the local id from the task id when nothing is known yet', () => {
    expect(vikunjaTaskToTodo(pulled(), context()).id).toBe(localIdForTask(4))
    expect(localIdForTask(4)).toBe('vikunja:4')
  })

  it('keeps the local id a known ref already points at', () => {
    const ctx = context({ knownRefs: { 'local-uuid': vikunjaRef(4) } })
    expect(vikunjaTaskToTodo(pulled(), ctx).id).toBe('local-uuid')
  })

  it('ignores a known ref for a different task and a foreign ref', () => {
    const ctx = context({
      knownRefs: {
        other: vikunjaRef(9),
        trello: { cardId: 'c', shortLink: null, listId: 'l', etag: null },
      },
    })
    expect(vikunjaTaskToTodo(pulled(), ctx).id).toBe('vikunja:4')
  })

  it('stores a ref whose etag is normalised to whole seconds', () => {
    const task = vikunjaTaskToTodo(
      pulled({ updated: '2026-09-20T17:57:12.566126293+03:00' }),
      context(),
    )

    expect(task.remoteRef).toEqual({
      taskId: 4,
      identifier: '#3',
      bucketId: 1,
      updated: '2026-09-20T14:57:12.000Z',
    })
  })

  it('records a missing bucket as null rather than as bucket zero', () => {
    const task = vikunjaTaskToTodo(pulled({ bucketId: 0 }), context())
    expect(task.remoteRef).toMatchObject({ bucketId: null })
  })
})

describe('vikunjaTaskToTodo — kanban mode', () => {
  it('takes the status from the bucket the task was found in', () => {
    expect(vikunjaTaskToTodo(pulled({ bucketId: 2 }), context()).status).toBe('inprogress')
    expect(vikunjaTaskToTodo(pulled({ bucketId: 5 }), context()).status).toBe('struggle')
  })

  it('falls back to input for an unmapped bucket', () => {
    expect(vikunjaTaskToTodo(pulled({ bucketId: 42 }), context()).status).toBe('input')
  })

  it('ignores the local status — the board is authoritative', () => {
    const ctx = context({ knownStatuses: { 'vikunja:4': 'struggle' } })
    expect(vikunjaTaskToTodo(pulled({ bucketId: 1 }), ctx).status).toBe('input')
  })

  it('timestamps a deleted task', () => {
    const task = vikunjaTaskToTodo(pulled({ bucketId: 6 }), context())

    expect(task.status).toBe('deleted')
    expect(task.deletedAt).toBe(Date.parse('2026-09-20T17:30:00+03:00'))
  })
})

describe('vikunjaTaskToTodo — flat mode', () => {
  const flat = (knownStatuses: Record<string, TodoStatus> = {}) =>
    context({ flat: true, knownStatuses })

  it('maps done to completed', () => {
    const task = vikunjaTaskToTodo(
      pulled({ done: true, doneAt: '2026-09-20T14:58:54Z', bucketId: 3 }),
      flat(),
    )
    expect(task.status).toBe('completed')
  })

  it.each(['inprogress', 'struggle', 'deleted'] as const)('keeps the local %s status', (status) => {
    expect(vikunjaTaskToTodo(pulled(), flat({ 'vikunja:4': status })).status).toBe(status)
  })

  it('reads an unknown task as input', () => {
    expect(vikunjaTaskToTodo(pulled(), flat()).status).toBe('input')
  })

  it('does not keep a local completed status for a task that is no longer done', () => {
    // The user un-ticked it in Vikunja; the widget must follow.
    expect(vikunjaTaskToTodo(pulled(), flat({ 'vikunja:4': 'completed' })).status).toBe('input')
  })

  it('keeps the local status under the id a known ref points at', () => {
    const ctx = context({
      flat: true,
      knownRefs: { 'local-uuid': vikunjaRef(4) },
      knownStatuses: { 'local-uuid': 'inprogress' },
    })
    expect(vikunjaTaskToTodo(pulled(), ctx).status).toBe('inprogress')
  })
})

describe('vikunjaTaskToTodo — fields', () => {
  it('converts the description to text and blanks an empty one', () => {
    expect(vikunjaTaskToTodo(pulled({ description: '<p>hi</p>' }), context()).description).toBe(
      'hi',
    )
    expect(vikunjaTaskToTodo(pulled({ description: '<p></p>' }), context()).description).toBeNull()
  })

  it('takes createdAt from `created`', () => {
    expect(vikunjaTaskToTodo(pulled(), context()).createdAt).toBe(
      Date.parse('2026-09-20T17:00:00+03:00'),
    )
  })

  it('takes completedAt from done_at', () => {
    const task = vikunjaTaskToTodo(
      pulled({ done: true, doneAt: '2026-09-20T14:58:54Z', bucketId: 3 }),
      context(),
    )

    expect(task.completedAt).toBe(Date.parse('2026-09-20T14:58:54Z'))
    expect(task.statusChangedAt).toBe(task.completedAt)
  })

  it('falls back to `updated` when done_at is missing (trap 6)', () => {
    const task = vikunjaTaskToTodo(pulled({ done: true, doneAt: null, bucketId: 3 }), context())
    expect(task.completedAt).toBe(Date.parse('2026-09-20T17:30:00+03:00'))
  })

  it('leaves completedAt null while the task is open', () => {
    const task = vikunjaTaskToTodo(pulled(), context())
    expect(task.completedAt).toBeNull()
    expect(task.statusChangedAt).toBe(Date.parse('2026-09-20T17:30:00+03:00'))
  })

  it('never produces NaN from an unparseable timestamp', () => {
    const task = vikunjaTaskToTodo(pulled({ created: 'nonsense', updated: 'nonsense' }), context())

    expect(Number.isFinite(task.createdAt)).toBe(true)
    expect(Number.isFinite(task.statusChangedAt)).toBe(true)
  })

  it('picks the first label that is a known project', () => {
    const ctx = context({ projectIds: new Set(['7']) })

    expect(vikunjaTaskToTodo(pulled({ labelIds: [1, 7] }), ctx).projectId).toBe('7')
    expect(vikunjaTaskToTodo(pulled({ labelIds: [1] }), ctx).projectId).toBeNull()
    expect(vikunjaTaskToTodo(pulled({ labelIds: [] }), ctx).projectId).toBeNull()
  })

  it('comes back clean and unlinked', () => {
    const task = vikunjaTaskToTodo(pulled(), context())
    expect(task.syncState).toBe('clean')
    expect(task.linkedTab).toBeNull()
  })
})
