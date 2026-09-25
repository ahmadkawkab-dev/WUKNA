# Google OAuth live-provider verification

The integration tests use a synthetic validated external ticket. They cover Wukna's callback,
exchange, and linking logic, but they do not verify Google's authorization screen, redirect,
claim mapping, or cancellation response. The live-provider scenarios below remain unverified.

## Prerequisites

1. Use a disposable, migrated PostgreSQL database. Start the API on `http://localhost:8080`
   and the Vite client on `http://localhost:5173`; open the client through that origin.
2. Configure the Google client ID and secret for the API, and register exactly
   `http://localhost:5173/api/auth/external/google/provider-callback` as an authorized
   redirect URI for that OAuth client.
3. Have two test Google identities. Keep one without a Wukna account for first-time and
   returning sign-in. Create a local password account with the second identity's email
   before trying Google sign-in. Use a third, distinct local password account for the
   provider-key conflict check.
4. Use a browser profile that can complete Google's consent flow. For cancellation, use a
   consent screen that still offers **Cancel** or **Deny**; revoke the test app's Google
   access or use another test identity if consent was already granted.

## Scenarios

| Scenario | Action | Expected result |
| --- | --- | --- |
| First-time and returning sign-in | Sign in with the first Google identity, sign out, then sign in with it again. | Both sessions resolve to the same Wukna user ID. The second visit creates no new user or Google login row. |
| Local-email collision | Sign in with the second Google identity before linking it to its existing local password account. | The browser shows `account_link_required`. No Google login is attached and no Wukna session is issued for that attempt. |
| Explicit linking | Sign in to that local account, open **Account → Preferences → Sign-in methods**, and link the second Google identity. Sign out, then sign in with Google. | Linking reports success, `/api/auth/account` lists `Google`, and subsequent Google sign-in returns the original local user ID. |
| Provider-key conflict | Sign in to the third local account and try linking the Google identity already owned by the second account. | The signed-in UI shows `external_login_already_linked`; ownership and the third account's sign-in methods remain unchanged. |
| Cancellation | Cancel Google sign-in, then cancel a linking attempt while signed in. | The browser shows `oauth_cancelled` in each relevant UI state. No user, login link, or refresh session is created by the cancelled attempt. |

For every scenario, confirm that the browser returns to `/auth/callback` on the configured
frontend origin. A successful login redirect may carry a short-lived one-time `code`; it must
never carry an access or refresh token. The `lapis.external` and
`lapis.google.link_intent` cookies should be removed after their callbacks. The exchange
binding cookie is `lapis.external.binding`; the application refresh cookie is
`wukna.refresh`. Confirm that `external_login_grants` stores credential hashes and a
consumption timestamp, without a raw code or browser binding.

Record the outcome and Wukna user IDs for each scenario in a private test log. Do not copy
Google credentials, cookies, exchange codes, access tokens, or refresh tokens into it.
