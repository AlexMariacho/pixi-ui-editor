Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { userAgent: "node" },
});
