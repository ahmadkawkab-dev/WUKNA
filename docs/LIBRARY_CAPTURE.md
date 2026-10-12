# Library drag-and-drop and YouTube sharing

Pictures and Documents accept device files dropped on their Dashboard category
panels or anywhere in the corresponding section. A section with an open folder
saves the files into that folder. Videos accepts HTTPS video links dropped on its
Dashboard panel or section, including YouTube watch, Shorts, and share links.
Video binaries are not uploaded.

Drops start the existing authenticated capture flow automatically. Files retain
the existing limits, content validation, malware scanning, private storage and
durable upload identity. Incorrect destinations, more than ten files, unavailable
storage and an already open Library action produce feedback without starting
another write. Errors remain in the existing dialog for explicit retry; a complete
batch closes immediately. Repeated automatic video capture treats the backend's
canonical duplicate response as already saved.

## Desktop YouTube

The `Save to Wukna` Manifest V3 extension adds a Wukna button to the YouTube Share
panel in Chromium browsers. Its toolbar popup is a fallback when YouTube changes
its panel markup. Source is in `frontend/browser-extension/wukna-youtube/`; the
downloadable ZIP is `frontend/public/downloads/wukna-youtube-extension.zip`.

1. Download and extract the ZIP.
2. Open Chrome, Opera or Edge's Extensions page, enable Developer mode, and Load
   unpacked from the extracted folder.
3. In extension settings, enter your Wukna origin and allow access to that host.
   Development uses `http://localhost:5173`; production uses its HTTPS origin.
4. Open a YouTube video, click Share, then Wukna. Sign in to Wukna if needed.

The extension opens a new Wukna Videos tab and delivers a validated canonical
link through an origin-checked page message. It uses only the configured Wukna
origin and the tab it created, with a short-lived delivery ticket and acknowledgment.
It does not read cookies or API tokens, fetch private Library data, or download
video media. Optional host permission is requested from the settings button.
Changing hosts revokes the previous optional permission. Content scripts run only
on YouTube; synthetic page clicks cannot trigger the share action.

This extension is an unpacked development artifact, not a Web Store publication.
Rebuild the ZIP from these source files after editing the extension. Copy the
approved `frontend/public/wukna.svg` and `wukna-192.png` (as `icon.png`) if branding
changes. Do not replace the folded symbol with a solid silhouette.

## Android YouTube

Install Wukna from a reachable HTTPS origin using a supported browser such as
Chrome. In the YouTube app, tap Share, expand the device's app list when needed,
and choose Wukna. The installed browser app's manifest advertises a POST share
target at `/library/share` with `title`, `text` and `url` fields.

The existing root service worker imports `library-share-worker.js` and accepts
only navigation POSTs to that endpoint. It rejects cross-site origins, bounds the
share fields, and writes a short-lived record to a separate IndexedDB store. A
303 redirect carries only an opaque ID into Videos. The page validates the link,
removes the incoming record and URL parameter, and resumes the existing private
save after authentication. A tab-scoped pending draft survives sign-in; successful
saving, explicit cancellation and explicit sign-out clear it. Shares expire after
15 minutes. No authenticated pages, API responses, cookies or access tokens are
cached by this worker. Existing push notification handlers and account binding
remain in the same root worker.

The browser/OS determines share-target availability and requires installation.
The computer's localhost address is not reachable from an Android phone.
YouTube's built-in desktop icon list is controlled by YouTube, so desktop use
requires the extension. Safari/iOS and Firefox do not currently support this web
share-target integration. See [Chrome's share-target documentation](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)
and [MDN compatibility](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target).

Videos → Save from YouTube provides these install instructions inside Wukna.

## Verification

`library-capture.test.mjs` covers destination checks, file limits, Android text-only
shares, URL validation, worker POST delivery and cross-site rejection.
`library-dom.test.mjs` covers automatic file/video drops and the initial-share
handoff under StrictMode. Existing notification worker tests remain applicable.
Browser evidence is kept in ignored `artifacts/library-capture/`.

The browser extension runtime is tested in a disposable Chromium profile with a
local YouTube panel fixture and a pregranted test host, followed by the real app
handoff, POST share handling, sign-in, duplicate prevention and explicit retry.
Physical Android system-menu installation and live YouTube DOM availability
require device/browser checks; these tests do not establish a production rollout.
The live unauthenticated YouTube check reached a “Sign in to confirm you’re not a
bot” interstitial, so the live Share panel could not be inspected in that test.
