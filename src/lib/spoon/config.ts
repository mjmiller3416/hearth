// Hearth's Enchanted Spoon configuration (Phase 4, Meals). Server-side only —
// it reads environment variables and must never be imported into a client
// component.
//
// Enchanted Spoon authenticates trusted first-party callers with a shared secret
// sent in the `X-API-Key` header (its INTEGRATION_API_KEY), resolving every
// request to the single household account (its INTEGRATION_USER_ID). Hearth is
// exactly such a caller: it reads that account's meal plan and meal cards,
// read-only (spec §5.4, D6). The secret lives in `ENCHANTED_SPOON_DEVICE_TOKEN`
// and its value must equal Enchanted Spoon's `INTEGRATION_API_KEY`; it is sent
// server-to-server only and never reaches the browser (spec §3.2).

/** True when the Enchanted Spoon base URL and device token are both configured. */
export function hasSpoonCredentials(): boolean {
  return Boolean(
    process.env.ENCHANTED_SPOON_API_URL &&
      process.env.ENCHANTED_SPOON_DEVICE_TOKEN,
  );
}
