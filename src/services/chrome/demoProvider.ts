import { LinkableTab } from '@/services/chrome/tabs.ts'
import { BookmarkTreeItem, ChromeTabGroupView } from '@/widgets/ChromeLibrary/types/types.ts'

const DEMO_WINDOW_ID = 1

const demoTabs: LinkableTab[] = [
  { title: 'OpenAI', url: 'https://openai.com/' },
  { title: 'GitHub', url: 'https://github.com/' },
  { title: 'Vite', url: 'https://vite.dev/' },
  { title: 'React', url: 'https://react.dev/' },
]

const demoGroups: ChromeTabGroupView[] = [
  {
    groupId: 101,
    windowId: DEMO_WINDOW_ID,
    title: 'Development',
    color: 'blue',
    collapsed: false,
    tabsCount: 2,
    tabs: [
      { kind: 'tab', tabId: 2001, windowId: DEMO_WINDOW_ID, title: 'GitHub', url: 'https://github.com/' },
      { kind: 'tab', tabId: 2002, windowId: DEMO_WINDOW_ID, title: 'Vite', url: 'https://vite.dev/' },
    ],
  },
  {
    groupId: 102,
    windowId: DEMO_WINDOW_ID,
    title: 'Design & Docs',
    color: 'purple',
    collapsed: false,
    tabsCount: 2,
    tabs: [
      { kind: 'tab', tabId: 2003, windowId: DEMO_WINDOW_ID, title: 'React', url: 'https://react.dev/' },
      { kind: 'tab', tabId: 2004, windowId: DEMO_WINDOW_ID, title: 'OpenAI', url: 'https://openai.com/' },
    ],
  },
]

const demoBookmarks: BookmarkTreeItem[] = [
  {
    kind: 'folder',
    id: 'demo-folder-dev',
    title: 'Development',
    children: [
      {
        kind: 'bookmark',
        id: 'demo-bookmark-vite',
        title: 'Vite Docs',
        url: 'https://vite.dev/guide/',
        path: ['Development'],
      },
      {
        kind: 'bookmark',
        id: 'demo-bookmark-react',
        title: 'React Docs',
        url: 'https://react.dev/learn',
        path: ['Development'],
      },
    ],
  },
  {
    kind: 'folder',
    id: 'demo-folder-tools',
    title: 'Tools',
    children: [
      {
        kind: 'bookmark',
        id: 'demo-bookmark-github',
        title: 'GitHub',
        url: 'https://github.com/',
        path: ['Tools'],
      },
    ],
  },
]

export function getDemoTabGroupsWithTabs(): ChromeTabGroupView[] {
  return demoGroups
}

export function getDemoBookmarkTree(): BookmarkTreeItem[] {
  return demoBookmarks
}

export function getDemoLinkableTabs(): LinkableTab[] {
  return demoTabs
}
