import { useLogin } from "@workspace/api-client-react";
import { portalLogin } from "@/lib/portal-login";

export function usePortalLogin() {
  return useLogin({
    mutation: { retry: false, mutationFn: ({ data }) => portalLogin(data) },
  });
}
