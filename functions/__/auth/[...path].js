/**
 * Cloudflare Pages Function — proxies /__/auth/* to Firebase Hosting.
 *
 * Why this exists:
 *   Firebase Auth SDK routes its popup/redirect handler through the `authDomain`
 *   you set in your Firebase config.  If authDomain = your Cloudflare domain,
 *   Firebase will try to reach  https://<authDomain>/__/auth/handler  (and
 *   /__/auth/iframe for session persistence).  Firebase Hosting won't serve
 *   those paths for a domain it doesn't own — but this Worker will, by
 *   transparently proxying every request to your actual Firebase Hosting project.
 *
 * Result:
 *   • signInWithPopup  → popup opens at feetracker.pages.dev/__/auth/handler (✓)
 *   • signInWithRedirect → address bar shows feetracker.pages.dev only      (✓)
 *   • The hidden iframe used for session persistence also stays on your domain (✓)
 *
 * Deploy:
 *   1. Put this file at  functions/__/auth/[...path].js  in your Pages project.
 *   2. Change authDomain in cfg1 (index.html) to "feetracker.pages.dev".
 *   3. Add feetracker.pages.dev to Firebase Console → Auth → Authorized Domains.
 *   4. Add https://feetracker.pages.dev/__/auth/handler to Google Cloud Console
 *      → APIs & Services → Credentials → your OAuth 2.0 client → Authorized
 *      redirect URIs.
 */

// ── Your Firebase Hosting project ID ──────────────────────────────────────
const FIREBASE_PROJECT_ID = "fee-tracker-f32f8";
const FIREBASE_AUTH_DOMAIN = `${FIREBASE_PROJECT_ID}.firebaseapp.com`;

export async function onRequest(context) {
  const { request, params } = context;

  // Reconstruct the upstream URL:
  //   incoming:  https://feetracker.pages.dev/__/auth/handler?...
  //   upstream:  https://fee-tracker-f32f8.firebaseapp.com/__/auth/handler?...
  const url = new URL(request.url);
  const pathSegments = params.path; // array of path segments after /__/auth/
  const upstreamPath  = `/__/auth/${Array.isArray(pathSegments) ? pathSegments.join("/") : pathSegments}`;
  const upstreamUrl   = `https://${FIREBASE_AUTH_DOMAIN}${upstreamPath}${url.search}`;

  // Forward the request, preserving method, headers, body.
  // Strip the Host header so Firebase Hosting sees its own host.
  const proxyHeaders = new Headers(request.headers);
  proxyHeaders.set("Host", FIREBASE_AUTH_DOMAIN);
  proxyHeaders.delete("CF-Connecting-IP"); // don't leak Cloudflare internal header

  const upstreamRequest = new Request(upstreamUrl, {
    method:  request.method,
    headers: proxyHeaders,
    body:    request.method !== "GET" && request.method !== "HEAD"
               ? request.body
               : undefined,
    redirect: "follow",
  });

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamRequest);
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }

  // Re-write the response headers:
  //   • Drop CORS headers Firebase sets for its own domain — the browser will
  //     use your domain's own CORS policy instead.
  //   • Drop Content-Security-Policy if it whitelists only firebaseapp.com,
  //     because the SDK JS on your page is on a different origin.
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("Content-Security-Policy");
  responseHeaders.delete("X-Frame-Options"); // allow iframe (used for session persistence)

  // For the auth handler HTML page, rewrite any hardcoded firebaseapp.com
  // origin references so postMessage works cross-origin correctly.
  const contentType = responseHeaders.get("Content-Type") || "";
  if (contentType.includes("text/html") || contentType.includes("javascript")) {
    const body = await upstreamResponse.text();
    // Replace the upstream origin with the Cloudflare Pages origin in JS strings.
    // The Firebase auth handler uses the page's own origin for postMessage target,
    // so in practice this substitution is usually a no-op — but it's a safe guard.
    const rewrittenBody = body
      .replaceAll(`https://${FIREBASE_AUTH_DOMAIN}`, url.origin)
      .replaceAll(`//${FIREBASE_AUTH_DOMAIN}`,       `//${url.hostname}`);
    return new Response(rewrittenBody, {
      status:  upstreamResponse.status,
      headers: responseHeaders,
    });
  }

  // For non-HTML/JS responses (images, JSON, etc.) stream through as-is.
  return new Response(upstreamResponse.body, {
    status:  upstreamResponse.status,
    headers: responseHeaders,
  });
}
