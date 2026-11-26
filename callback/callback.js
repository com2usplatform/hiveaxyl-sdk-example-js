// Sign-in callback page for `auth.openSignInPopup()`.
// Host this page on the same origin as your game, and use its URL as `redirectUri`.
// The provider sends the player here with the sign-in answer in the URL.
// For Google, X and Apple (through the Hive Axyl relay) the answer is an authorization code. For Steam it is a signed OpenID answer.
// The page hands the URL to the game window and closes. It does not store or log the answer.
// The SDK in the game accepts the URL only with the `state` of its sign-in.
// For a window message it also checks the origin and the sending window.
;(() => {
  const url = location.href
  const state = new URL(url).searchParams.get('state')
  // Remove the answer and `state` from the address bar and the history entry before anything else runs.
  try {
    history.replaceState(null, '', location.pathname)
  } catch {
    // The window closes below in any case.
  }
  // Main path. Post only to this origin. Never use '*': the URL holds the sign-in answer.
  try {
    window.opener?.postMessage(url, location.origin)
  } catch {
    // The window message failed. The channel below still runs.
  }
  // Backup path on the same origin. It is always sent, alongside the window message.
  // It can reach the game window when the window message cannot,
  // for example when `window.opener` is `null` and the line above sends nothing.
  // The channel is named for this sign-in's `state`,
  // so only the sign-in that waits for this `state` receives it. Without a `state` there is nothing to send.
  if (state) {
    try {
      const channel = new BroadcastChannel(`hiveaxyl-webauth:${state}`)
      channel.postMessage(url)
      channel.close()
    } catch {
      // Older browsers lack BroadcastChannel. The window message is the main path.
    }
  }
  window.close()
})()
