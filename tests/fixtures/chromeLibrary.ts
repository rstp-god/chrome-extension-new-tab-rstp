import { BookmarkTreeItem, ChromeTabGroupView } from '@/widgets/ChromeLibrary/types/types.ts';

export const groupsFixture: ChromeTabGroupView[] = [
  {
    groupId: 1,
    windowId: 1,
    title: 'Development',
    color: 'blue',
    collapsed: false,
    tabsCount: 2,
    tabs: [
      { kind: 'tab', tabId: 11, windowId: 1, title: 'GitHub', url: 'https://github.com/' },
      { kind: 'tab', tabId: 12, windowId: 1, title: 'React Docs', url: 'https://react.dev/' },
    ],
  },
  {
    groupId: 2,
    windowId: 1,
    title: 'Design',
    color: 'purple',
    collapsed: false,
    tabsCount: 1,
    tabs: [{ kind: 'tab', tabId: 21, windowId: 1, title: 'Figma', url: 'https://figma.com/' }],
  },
]

export const bookmarksFixture: BookmarkTreeItem[] = [
  {
    kind: 'folder',
    id: 'folder-dev',
    title: 'Development',
    children: [
      {
        kind: 'bookmark',
        id: 'bookmark-react',
        title: 'React',
        url: 'https://react.dev/',
        path: ['Development'],
      },
    ],
  },
  {
    kind: 'bookmark',
    id: 'bookmark-vite',
    title: 'Vite',
    url: 'https://vite.dev/',
    path: [],
  },
]
