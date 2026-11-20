import {ApiRequestError} from "./request";
/** Fixed customer copy only. Never render an upstream message, credential or diagnostic. */
export function mt5AccountMessage(error:unknown):string{
 const messages:Record<string,string>={
  AUTH_REQUIRED:"Please sign in again to connect your account.",ACCESS_DENIED:"You are not authorized to connect this account.",
  BROKER_AUTHENTICATION_FAILED:"Check your account number, password and exact broker server, then try again.",
  BROKER_SERVER_UNAVAILABLE:"The broker server is unavailable. Check the exact server name or try again later.",
  PROVISIONING_CAPACITY_UNAVAILABLE:"We cannot connect another account right now. Please contact support.",
  HTTP_429:"Too many connection attempts. Wait a moment before trying again.",
  API_TIMEOUT:"The connection is taking longer than expected. Check its status before trying again.",
  PROVISIONING_OUTCOME_UNCERTAIN:"We could not confirm this connection. Please contact support before trying again.",
  OWNERSHIP_VERIFICATION_REQUIRED:"We could not confirm your authorization for this account. Please contact support.",
  REQUEST_EXPIRED:"Your connection request has expired. Check its status before submitting again.",
  ACCOUNT_PROOF_REJECTED:"Check your account number, password and exact broker server, then try again.",
  BROKER_BINDING_MISMATCH:"This account belongs to a different broker. Check your broker selection.",
  ACCOUNT_MODE_MISMATCH:"This account does not match the selected account type. Choose Demo or Real as shown in MT5.",
  UNSUPPORTED_ACCOUNT_CONFIGURATION:"This broker or account type is not currently supported. Contact support for help.",
  ACCOUNT_ALREADY_BOUND:"This account is already linked to another profile. Contact support for help.",
  ACCOUNT_REBIND_REQUIRES_RECONCILIATION:"Your current account cannot be replaced yet. Contact support before switching accounts.",
  ACCOUNT_NOT_ASSIGNED:"This account is not ready to connect yet. Contact support for help.",
  PROVISIONING_NOT_CONFIGURED:"New account connections are temporarily unavailable. Please contact support.",
  PROVISIONING_ALREADY_PENDING:"Your connection request is already in progress. Check its status before trying again.",
  PROVISIONING_REQUEST_CONFLICT:"An earlier connection request needs attention. Check its status before trying again.",
  PROVISIONING_STORAGE_UNAVAILABLE:"We could not confirm your connection request. Check its status before trying again.",
  OWNERSHIP_CONFIRMATION_REQUIRED:"Confirm that you own or are authorized to connect this account.",
  MT5_GATEWAY_NOT_CONFIGURED:"Account connections are temporarily unavailable. Please contact support.",
  MT5_GATEWAY_AUTH_REJECTED:"Account connections are temporarily unavailable. Please contact support.",
  MT5_GATEWAY_UNAVAILABLE:"We could not reach the account connection service. Please try again later.",
  MT5_GATEWAY_TIMEOUT:"The connection is taking longer than expected. Check its status before trying again.",
  MT5_SESSION_UNAVAILABLE:"Your MT5 account is currently unavailable. Check its status or contact support.",
  MT5_BINDING_UNVERIFIED:"We could not confirm your MT5 account. Check your details or contact support.",
 };
 const code=error instanceof ApiRequestError?error.code:typeof error==="string"?error:"";
 return Object.hasOwn(messages,code)?messages[code]:"We could not confirm the connection. Check its status before trying again.";
}
