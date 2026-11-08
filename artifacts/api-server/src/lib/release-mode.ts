/** An explicit release profile; never inferred from missing credentials or worker health. */
export function nonTradingRelease() {
  const mode = process.env.EA_RELEASE_MODE;
  if (mode !== undefined && mode !== "nontrading") throw Error("Invalid application release mode");
  return mode === "nontrading";
}
export function financialExecutionBlocked() {
  return {ok:false,httpStatus:403,ticket:null,retcode:null,message:"Financial execution is disabled in this release",data:{code:"FINANCIAL_EXECUTION_DISABLED",uncertain:false},retriable:false,attempts:0};
}
