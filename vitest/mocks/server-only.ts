// server-only unconditionally throws when imported outside a webpack server bundle (the same
// guard every manual verification script this session used has had to patch around via
// Module._load). vitest.config.ts aliases the real package to this empty stub so every data/
// service file's `import "server-only"` resolves to nothing under Vitest.
export {};
