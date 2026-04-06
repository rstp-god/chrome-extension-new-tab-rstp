export function createChromeMock() {
  return {
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
      },
      onChanged: {
        addListener: () => {},
      },
    },
    tabs: {
      query: async () => [],
      create: async () => {},
      update: async () => {},
    },
    windows: {
      update: async () => {},
    },
    bookmarks: {
      getTree: async () => [],
    },
    tabGroups: {
      query: async () => [],
      update: async () => {},
    },
  }
}

export function installChromeMock(mock = createChromeMock()) {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: mock,
  })
  return mock
}
