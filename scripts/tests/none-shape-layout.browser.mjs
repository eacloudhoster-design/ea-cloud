// The interactive-portrait request supersedes the historical reserved-space
// screenshots. Exercise the current None collapse/restore and responsive suite
// instead of comparing against pre-fullscreen navigation coordinates.
if (process.env.APP_ORIGIN) process.env.APP_ORIGIN = new URL(process.env.APP_ORIGIN).origin;
await import('./interactive-portrait.browser.mjs');
