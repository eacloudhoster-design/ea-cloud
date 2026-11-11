// Full authenticated app with execution/maintenance disabled. No migration hook.
// Production use requires its own deployment approval and existing session/DB bindings.
process.env.EA_MT5_MANAGEMENT_ONLY = "1";
await import("./dist/index.mjs");
