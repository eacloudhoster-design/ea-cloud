// Persistent hidden portrait space and sibling geometry regression suite.
if (process.env.APP_ORIGIN)
  process.env.APP_ORIGIN = new URL(process.env.APP_ORIGIN).origin;
await import("./interactive-portrait.browser.mjs");
