// Make a Home Base feed token (GET /api/home-base/summary).
//
//   node scripts/home-base-token.mjs <out-file>
//
// Writes the raw token to <out-file> (mode 600) and prints ONLY its SHA-256
// digest. Put the digest in Hearth's HOME_BASE_TOKEN_SHA256 on Railway (append
// with a comma to rotate), and give the raw token to Home Base's runtime secret
// settings. Never paste the raw token into email or chat; delete the file once
// it's provisioned. The same script makes the per-app keys Hearth sends to
// Homeroom and Every Cent (their HOME_BASE_KEY_SHA256 takes the digest).

import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/home-base-token.mjs <out-file>");
  process.exit(1);
}
const token = `hb_${randomBytes(32).toString("base64url")}`;
writeFileSync(out, token, { mode: 0o600, flag: "wx" });
console.log(createHash("sha256").update(token, "utf8").digest("hex"));
