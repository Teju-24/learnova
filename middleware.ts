import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = ["/me", "/start"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Verify the JWT locally when the project uses asymmetric signing keys
  // (getClaims only reaches the network for legacy symmetric keys, in which
  // case it is no slower than the getUser call it replaces). The dashboard page
  // still re-verifies independently, so this gate stays authoritative enough
  // for a redirect while dropping a network hop from the common path.
  const authStart = Date.now();
  const { data: claimsData } = await supabase.auth.getClaims();
  const authed = Boolean(claimsData?.claims?.sub);
  const authMs = Date.now() - authStart;

  // Visible in the browser Network panel without server log access.
  response.headers.set("Server-Timing", `mw-auth;dur=${authMs}`);
  if (process.env.DASHBOARD_DEBUG === "1") {
    console.log(
      `[middleware-timing] auth.getClaims: ${authMs}ms authed=${authed}`
    );
  }

  const isProtected = PROTECTED_PREFIXES.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );

  if (isProtected && !authed) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/me/:path*", "/start/:path*"],
};
