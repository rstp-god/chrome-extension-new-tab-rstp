import { describe, expect, it } from 'vitest'

import {
  VIKUNJA_MAX_DESCRIPTION_LENGTH,
  VIKUNJA_MAX_TITLE_LENGTH,
} from '@/background/vikunja/messages.ts'
import { statusForContainerId } from '@/widgets/Todo/integrations/statusMapping.ts'
import { getVikunjaBoardPillClass } from '@/widgets/Todo/integrations/vikunja/projectStyles.ts'
import { projectPillClassForHue } from '@/widgets/Todo/utils/projectPillPalette.ts'
import {
  clampForVikunja,
  htmlToText,
  localIdForTask,
  textToHtml,
  vikunjaTaskToTodo,
} from '@/widgets/Todo/integrations/vikunja/mapping.ts'

import type { VikunjaPulledTask } from '@/background/vikunja/messages.ts'
import type { StatusListMapping, TodoStatus } from '@/widgets/Todo/integrations/types.ts'
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
    ...overrides,
  }
}

function context(overrides: Partial<VikunjaTaskContext> = {}): VikunjaTaskContext {
  return {
    mapping: MAPPING,
    localIdByTaskId: new Map(),
    knownStatuses: {},
    flat: false,
    boardProjectId: 1,
    ...overrides,
  }
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

  it('drops a script or style block with its contents', () => {
    // Stripping only the tags would leave the code sitting in the task text.
    expect(htmlToText('<p>before</p><script>alert(1)</script><p>after</p>')).toBe('before\n\nafter')
    expect(htmlToText('<style>.a { color: red }</style><p>text</p>')).toBe('text')
    expect(htmlToText('<SCRIPT type="text/javascript">let a = 1 > 0</SCRIPT>x')).toBe('x')
  })

  it('treats a quoted > inside an attribute as part of the tag', () => {
    expect(htmlToText('<p><img alt="a > b" src="x.png">text</p>')).toBe('text')
    expect(htmlToText("<p><span data-x='a > b'>text</span></p>")).toBe('text')
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

describe('getVikunjaBoardPillClass', () => {
  it('paints one board the same colour every time', () => {
    // Derived from the id rather than cached, so the pill survives a reload,
    // a new device and a config the user never re-saves.
    expect(getVikunjaBoardPillClass(8)).toBe(getVikunjaBoardPillClass(8))
    expect(getVikunjaBoardPillClass(8)).toEqual(expect.any(String))
  })

  it('gives neighbouring ids different colours', () => {
    // Two boards created one after the other are the common case, and two
    // pills the user cannot tell apart would defeat the point of having them.
    expect(getVikunjaBoardPillClass(8)).not.toBe(getVikunjaBoardPillClass(9))
  })

  it('falls back to the neutral pill for an id that is not a number', () => {
    // Belt and braces: the persisted schema forbids one, and a NaN would
    // otherwise index outside the palette.
    const neutral = getVikunjaBoardPillClass(Number.NaN)
    expect(neutral).toBe(getVikunjaBoardPillClass(Number.POSITIVE_INFINITY))
    expect(neutral).toEqual(expect.any(String))
  })

  it('never paints a board in the colour of "no colour found"', () => {
    // The neutral pill is what an unplaceable colour looks like. A board's
    // hue is derived and always succeeds, so none of them may look like a
    // failure — whatever id the rotation lands on.
    const neutral = getVikunjaBoardPillClass(Number.NaN)
    const grey = projectPillClassForHue('black')
    for (let projectId = 1; projectId <= 40; projectId += 1) {
      const painted = getVikunjaBoardPillClass(projectId)
      expect(painted).not.toBe(neutral)
      expect(painted).not.toBe(grey)
    }
  })
})

describe('vikunjaTaskToTodo — identity', () => {
  it('derives the local id from the task id when nothing is known yet', () => {
    expect(vikunjaTaskToTodo(pulled(), context()).id).toBe(localIdForTask(4))
    expect(localIdForTask(4)).toBe('vikunja:4')
  })

  it('keeps the local id the index already points at', () => {
    const ctx = context({ localIdByTaskId: new Map([[4, 'local-uuid']]) })
    expect(vikunjaTaskToTodo(pulled(), ctx).id).toBe('local-uuid')
  })

  it('ignores an index entry for a different task', () => {
    const ctx = context({ localIdByTaskId: new Map([[9, 'other']]) })
    expect(vikunjaTaskToTodo(pulled(), ctx).id).toBe('vikunja:4')
  })

  it('stores a ref whose etag is normalised to whole seconds', () => {
    const task = vikunjaTaskToTodo(
      pulled({ updated: '2026-09-20T17:57:12.566126293+03:00' }),
      context(),
    )

    expect(task.remoteRef).toEqual({
      taskId: 4,
      // The board the pull was for, so the task can be found again once
      // there is more than one.
      projectId: 1,
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

  it('keeps the local status under the id the index points at', () => {
    const ctx = context({
      flat: true,
      localIdByTaskId: new Map([[4, 'local-uuid']]),
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

  it('makes the board the task’s project, for every task of it', () => {
    // A Vikunja task lives *in* a project, and that project is the board it
    // was pulled from — labels are somebody else's vocabulary.
    const ctx = context({ boardProjectId: 8 })

    expect(vikunjaTaskToTodo(pulled(), ctx).projectId).toBe('8')
    expect(vikunjaTaskToTodo(pulled({ id: 9 }), ctx).projectId).toBe('8')
    // The same id the ref records, and the same one `Project.id` uses.
    expect(vikunjaTaskToTodo(pulled(), ctx).remoteRef).toMatchObject({ projectId: 8 })
  })

  it('comes back clean and unlinked', () => {
    const task = vikunjaTaskToTodo(pulled(), context())
    expect(task.syncState).toBe('clean')
    expect(task.linkedTab).toBeNull()
  })
})

describe('clampForVikunja', () => {
  it('leaves a normal task alone', () => {
    expect(clampForVikunja('Buy milk', 'two litres')).toEqual({
      title: 'Buy milk',
      description: '<p>two litres</p>',
    })
  })

  it('cuts a title to the API ceiling', () => {
    const out = clampForVikunja('x'.repeat(5000), '')

    expect(out.title).toHaveLength(VIKUNJA_MAX_TITLE_LENGTH)
    expect(out.description).toBe('')
  })

  it('never leaves half of a surrogate pair at the cut', () => {
    // A lone surrogate survives JSON.stringify and reaches the instance as a
    // broken character.
    const out = clampForVikunja('a'.repeat(VIKUNJA_MAX_TITLE_LENGTH - 1) + '😀', '')

    expect(out.title).toHaveLength(VIKUNJA_MAX_TITLE_LENGTH - 1)
    expect(out.title.endsWith('a')).toBe(true)
  })

  it('measures the description as HTML, so escaping cannot overshoot the limit', () => {
    // Each `&` becomes five characters, so 6 000 of them render to 30 000.
    const out = clampForVikunja('t', '&'.repeat(6000))

    expect(out.description.length).toBeLessThanOrEqual(VIKUNJA_MAX_DESCRIPTION_LENGTH)
    // And the cut lands between characters, never inside an escape.
    expect(out.description.endsWith('&amp;</p>')).toBe(true)
    expect(htmlToText(out.description).startsWith('&&&')).toBe(true)
  })

  it('keeps as much of the description as fits', () => {
    const out = clampForVikunja('t', 'x'.repeat(VIKUNJA_MAX_DESCRIPTION_LENGTH * 2))

    // Within a `<p>` wrapper of the ceiling, not an order of magnitude under.
    expect(out.description.length).toBeGreaterThan(VIKUNJA_MAX_DESCRIPTION_LENGTH - 20)
    expect(out.description.length).toBeLessThanOrEqual(VIKUNJA_MAX_DESCRIPTION_LENGTH)
  })
})
