# Save to Wukna — desktop YouTube capture

Load this folder as an unpacked extension in Chrome, Opera, or Edge using the
browser's Extensions page, Developer mode, and Load unpacked. In its settings,
enter your Wukna address and allow access to that address. Local development
uses `http://localhost:5173`; a deployed app uses its HTTPS address.

Open a YouTube video, click Share, then Wukna. The extension opens Wukna and
passes the link to the existing private Videos save flow. If you are signed out,
sign in first; a failed save stays available for retry. The toolbar button is
also available if YouTube changes its Share panel markup. Repeated sharing of
an already saved URL does not create another item.

The extension runs its panel script only on YouTube. Optional host access is
requested only for your configured Wukna host; delivery checks the exact origin
and the tab created for that capture. It stores the Wukna address and short-lived
pending links, never passwords, cookies, or API access tokens. Links expire
after 15 minutes. It does not fetch or download video media.

This is an unpacked development extension, not a Chrome Web Store publication.
Android uses Wukna's installed PWA share target instead of this extension.
