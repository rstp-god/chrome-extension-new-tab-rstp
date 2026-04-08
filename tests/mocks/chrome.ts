export function createChromeMock() {
  return {
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
      },
      onChanged: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
  } as unknown as typeof chrome
}

export function installChromeMock(chromeMock: typeof chrome) {
  Object.defineProperty(globalThis, 'chrome', {
    value: chromeMock,
    configurable: true,
  })
}
