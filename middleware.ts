import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATH_PREFIXES = ["/api/health", "/_next", "/favicon.ico"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function timingSafeEqual(a: string, b: string) {
  const maxLength = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let index = 0; index < maxLength; index++) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return diff === 0;
}

function unauthorized(message = "Authentication required") {
  return new NextResponse(message, {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="FeedFlow", charset="UTF-8"',
      "Cache-Control": "no-store"
    }
  });
}

function hasValidCredential(user: string, password: string, expectedUser: string, expectedPassword?: string) {
  return Boolean(expectedPassword) && timingSafeEqual(user, expectedUser) && timingSafeEqual(password, expectedPassword || "");
}

export function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const authRequired = process.env.APP_BASIC_AUTH_REQUIRED !== "false";
  if (!authRequired) {
    return NextResponse.next();
  }

  const expectedUser = process.env.APP_BASIC_AUTH_USERNAME || "admin";
  const expectedPassword = process.env.APP_BASIC_AUTH_PASSWORD;
  const testAuthEnabled = process.env.APP_TEST_AUTH_ENABLED === "true";
  const expectedTestUser = process.env.APP_TEST_AUTH_USERNAME || "tester";
  const expectedTestPassword = process.env.APP_TEST_AUTH_PASSWORD;

  if (!expectedPassword) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.next();
    }
    return new NextResponse("APP_BASIC_AUTH_PASSWORD is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) {
    return unauthorized();
  }

  let user = "";
  let password = "";
  try {
    const decoded = atob(authHeader.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator >= 0) {
      user = decoded.slice(0, separator);
      password = decoded.slice(separator + 1);
    }
  } catch {
    return unauthorized();
  }

  const adminCredentialValid = hasValidCredential(user, password, expectedUser, expectedPassword);
  const testCredentialValid = testAuthEnabled && hasValidCredential(user, password, expectedTestUser, expectedTestPassword);

  if (!adminCredentialValid && !testCredentialValid) {
    return unauthorized();
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
