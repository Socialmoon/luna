import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_DASHBOARD_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_SESSION_COOKIE,
  adminAuthConfigured,
  verifySessionValue,
} from "@/lib/admin-auth-shared";
import { getSafeAdminRedirect } from "@/lib/admin-auth-redirect";

function setProtectedHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isDashboardRequest = pathname === ADMIN_DASHBOARD_PATH || pathname.startsWith(`${ADMIN_DASHBOARD_PATH}/`);

  if (!isDashboardRequest) {
    return NextResponse.next();
  }

  if (!adminAuthConfigured()) {
    return setProtectedHeaders(NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url)));
  }

  const session = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const isAuthenticated = await verifySessionValue(session);

  if (!isAuthenticated) {
    const loginUrl = new URL(ADMIN_LOGIN_PATH, request.url);
    loginUrl.searchParams.set("redirect", getSafeAdminRedirect(`${pathname}${search}`));
    return setProtectedHeaders(NextResponse.redirect(loginUrl));
  }

  return setProtectedHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/leads/:path*"],
};
