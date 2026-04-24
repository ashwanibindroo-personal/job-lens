global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: { addListener: jest.fn() }
  },
  scripting: { executeScript: jest.fn() },
  tabs: { query: jest.fn() }
};
global.fetch = jest.fn();
