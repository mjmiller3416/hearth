// The consent page for the ChatGPT connector: plain, phone-friendly HTML in
// Hearth's look (warm ground, ink, hairlines; spec §7). It opens in a popup from
// chatgpt.com, usually on a phone, so it is one narrow column with big targets.
// No scripts at all; every value is escaped.

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: #2f7ff0 linear-gradient(160deg, #35b0f5 0%, #2f7ff0 46%, #4a55e2 100%) fixed; color: #141a33;
  font: 17px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  display: flex; align-items: flex-start; justify-content: center; padding: 48px 16px; }
main { width: 100%; max-width: 420px; background: #fff; border: 0;
  border-radius: 24px; padding: 28px 24px; box-shadow: 0 24px 60px -24px rgba(6,10,40,.6); }
h1 { font: 600 28px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0 0 4px; }
.brand { color: #8791ae; font-size: 14px; letter-spacing: .06em; text-transform: uppercase; margin: 0 0 18px; }
p { margin: 0 0 14px; }
.soft { color: #4a5475; font-size: 15px; }
label { display: block; font-weight: 600; margin: 18px 0 6px; }
input[type=password] { width: 100%; font: inherit; padding: 12px 14px; border-radius: 10px;
  border: 1px solid #c8d0e2; background: #fff; color: #141a33; }
input[type=password]:focus { outline: 2px solid #3f5bff; outline-offset: 1px; }
.error { background: #fde6e2; color: #d63a2b; border-radius: 10px; padding: 10px 14px; margin: 14px 0 0; }
.actions { display: flex; gap: 12px; margin-top: 22px; }
button { flex: 1; font: inherit; font-weight: 600; padding: 13px 16px; border-radius: 999px; cursor: pointer; }
.allow { background: #3f5bff; color: #fff; border: 1px solid #3f5bff; }
.cancel { order: -1; background: #eef1f9; color: #141a33; border: 1px solid #eef1f9; }
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body><main><p class="brand">Hearth</p>${body}</main></body></html>`;
}

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  "referrer-policy": "no-referrer",
};

export interface ConsentPageArgs {
  /** Hidden fields to post back: the authorize parameters plus the form token. */
  hidden: Record<string, string>;
  /** The browser already holds the wall's device cookie: no password needed. */
  deviceAuthorized: boolean;
  /** A line to show above the buttons (wrong password, too many tries). */
  error?: string;
  /** The name the client registered with, if any. */
  clientName?: string;
}

/** The consent page: who's asking, what they'll get, Allow / Cancel. */
export function consentPage(args: ConsentPageArgs, status = 200): Response {
  const hidden = Object.entries(args.hidden)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  const who =
    args.clientName && !/chatgpt/i.test(args.clientName)
      ? `${esc(args.clientName)} (through ChatGPT)`
      : "ChatGPT";
  const password = args.deviceAuthorized
    ? `<p class="soft">This browser is already signed in to the wall, so no password is needed.</p>`
    : `<label for="password">Connect password</label>
<input id="password" name="password" type="password" autocomplete="current-password"
  autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus>
<p class="soft" style="margin-top:8px">Ask Mitchell if you don't have it.</p>`;
  const error = args.error ? `<p class="error" role="alert">${esc(args.error)}</p>` : "";

  const body = `<h1>Connect ${who}?</h1>
<p>${who} wants to use Hearth as you. It will be able to see and change everything you can on the wall: the family calendar, cleaning and chores, meals and the shopping list, and the kids' schedule.</p>
<form method="post" action="/api/oauth/authorize">${hidden}${password}${error}
<div class="actions">
<button class="allow" type="submit" name="decision" value="allow">Allow</button>
<button class="cancel" type="submit" name="decision" value="cancel" formnovalidate>Cancel</button>
</div></form>`;
  return new Response(shell("Connect to Hearth", body), { status, headers: HTML_HEADERS });
}

/** A dead end: an invalid request that must not be redirected anywhere. */
export function errorPage(message: string, status = 400): Response {
  const body = `<h1>Can't connect</h1><p>${esc(message)}</p>
<p class="soft">Close this window and start again from ChatGPT.</p>`;
  return new Response(shell("Can't connect to Hearth", body), { status, headers: HTML_HEADERS });
}
