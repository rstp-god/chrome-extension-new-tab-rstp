import { BookmarkTreeItem, ChromeTabGroupView } from '@/widgets/ChromeLibrary/types/types.ts'

export const groupsFixture: ChromeTabGroupView[] = [
  {
    groupId: 1,
    windowId: 1,
    title: 'Dev',
    color: 'blue',
    collapsed: false,
    tabsCount: 1,
    tabs: [{ kind: 'tab', tabId: 11, windowId: 1, title: 'GitHub', url: 'https://github.com' }],
  },
]

export const bookmarksFixture: BookmarkTreeItem[] = [
  {
    kind: 'folder',
    id: 'f-1',
    title: 'Docs',
    children: [
      {
        kind: 'bookmark',
        id: 'b-1',
        title: 'React',
        url: 'https://react.dev',
        path: ['Docs'],
      },
    ],
  },
]
