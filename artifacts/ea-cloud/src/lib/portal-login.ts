import { login, type LoginInput } from "@workspace/api-client-react";

/** One user-initiated credential submission. Never retry an ambiguous POST. */
export async function portalLogin(data: LoginInput) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      login(data, { signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Login request timed out"));
        }, 30000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
