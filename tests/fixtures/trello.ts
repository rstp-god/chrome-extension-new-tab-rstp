import type { StatusListMapping } from '@/widgets/Todo/integrations/types.ts'
import type {
  TrelloBoard,
  TrelloCard,
  TrelloLabel,
  TrelloList,
  TrelloMember,
} from '@/widgets/Todo/integrations/trello/schema.ts'
import type { TrelloHiddenMetadata } from '@/widgets/Todo/integrations/trello/types.ts'

/**
 * Frozen timestamp used by every fixture so tests are deterministic. Picked
 * arbitrarily — `2023-11-14T22:13:20.000Z`. Tests that need a different
 * "now" should use `vi.useFakeTimers()` + `vi.setSystemTime(...)`.
 */
export const FIXTURE_TIMESTAMP = 1_700_000_000_000

export const trelloMemberFixture: TrelloMember = {
  id: 'member-1',
  username: 'tester',
  fullName: 'Test User',
}

export const trelloBoardFixture: TrelloBoard = {
  id: 'board-1',
  name: 'Test Board',
}

/** One list per `TodoStatus` so the mapping is unambiguous. */
export const trelloListsFixture: TrelloList[] = [
  { id: 'list-input', name: 'Inbox' },
  { id: 'list-inprogress', name: 'Doing' },
  { id: 'list-struggle', name: 'Stuck' },
  { id: 'list-completed', name: 'Done' },
  { id: 'list-deleted', name: 'Trash' },
]

/**
 * Includes:
 *  - a plain hue (`green`) — exercises the standard color → class lookup
 *  - a `_dark` suffix (`blue_dark`) — exercises the suffix-stripping branch
 *  - an unknown color (`fuchsia`) — exercises the fallback branch
 *  - a `null` color (`label-no-color`) — exercises the null guard
 */
export const trelloLabelsFixture: TrelloLabel[] = [
  { id: 'label-green', name: 'Feature', color: 'green' },
  { id: 'label-blue-dark', name: 'Bug', color: 'blue_dark' },
  { id: 'label-fuchsia', name: 'Wild', color: 'fuchsia' },
  { id: 'label-no-color', name: 'Misc', color: null },
]

export const listMappingFixture: StatusListMapping = {
  input: ['list-input'],
  inprogress: ['list-inprogress'],
  struggle: ['list-struggle'],
  completed: ['list-completed'],
  deleted: ['list-deleted'],
}

export const hiddenMetadataFixture: TrelloHiddenMetadata = {
  version: 1,
  localId: 'local-uuid-1',
  createdAt: FIXTURE_TIMESTAMP,
  statusChangedAt: FIXTURE_TIMESTAMP,
}

/**
 * Builds a `card.desc` value with the same format `writeHiddenMetadata`
 * produces — duplicated here on purpose so fixtures don't depend on the
 * code under test.
 */
function buildDescWithMetadata(userText: string, meta: TrelloHiddenMetadata): string {
  const blob = JSON.stringify(meta)
  const block = `<!-- newtab-todo:v1\n${blob}\n-->`
  return userText.length > 0 ? `${userText}\n\n${block}` : block
}

/**
 * Default card sits in the `input` list, has one label, and carries valid
 * hidden metadata in its description.
 */
export function trelloCardFixture(overrides: Partial<TrelloCard> = {}): TrelloCard {
  return {
    id: 'card-1',
    name: 'Default card',
    desc: buildDescWithMetadata('Card body', hiddenMetadataFixture),
    idList: 'list-input',
    idLabels: ['label-green'],
    shortLink: 'abc123',
    dateLastActivity: '2023-11-14T22:13:20.000Z',
    ...overrides,
  }
}

export const trelloCardWithoutMetadataFixture: TrelloCard = {
  id: 'card-no-meta',
  name: 'Plain card',
  desc: 'Plain user description with no embedded metadata',
  idList: 'list-inprogress',
  idLabels: [],
  shortLink: 'plain1',
  dateLastActivity: '2023-11-14T22:13:20.000Z',
}

/**
 * Description ends with a `<!-- newtab-todo:v1 ... -->` block whose JSON
 * payload is malformed. The parser must strip the comment and return
 * `meta: null` without throwing.
 */
export const trelloCardWithCorruptMetadataFixture: TrelloCard = {
  id: 'card-corrupt-meta',
  name: 'Corrupt meta card',
  desc: 'User text\n\n<!-- newtab-todo:v1\n{not valid json\n-->',
  idList: 'list-input',
  idLabels: ['label-blue-dark'],
  shortLink: 'corrupt1',
  dateLastActivity: '2023-11-14T22:13:20.000Z',
}
