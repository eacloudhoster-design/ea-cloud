export function loginErrorMessage(error: unknown): string {
  const apiError = error as { status?: number; data?: { error?: unknown } } | null;
  if (apiError?.status === 401) return "Invalid credentials";
  if (apiError?.status === 403 && typeof apiError.data?.error === "string") {
    return apiError.data.error;
  }
  if (apiError?.status === 429) return "Too many login attempts. Please try again later.";
  return "Unable to reach the login service. Please try again later or contact support.";
}
