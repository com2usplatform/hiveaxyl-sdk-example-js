// Usage example: Google, X, Steam and Apple sign-in with the login recipe. It has no UI.
// `APP:` comments mark where your game must supply code, UI or a decision.
import { detectEnvironment } from '@com2usplatform/hiveaxyl'
import { preloadAppleJs, type ProviderLoginResult, type ProviderSignIn } from '../recipes/login'
import { enterGameUnlessBlocked, type GameScreens, type Login } from './initialization'

// APP: register every redirect URI below with each provider, character for character.
// `callback.html` is the page in `callback/`. Host it on your game origin.
// `/play` is your game page. The recipe returns there when it has to move the whole page.
const CALLBACK = `${location.origin}/callback.html`
const GAME_PAGE = `${location.origin}/play`

/** The providers your game offers. Every value is your own configuration. */
export function providers() {
  return {
    google: {
      provider: 'GOOGLE',
      authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      // APP: the client ID of your Google "Web application" OAuth client.
      clientId: 'YOUR_GOOGLE_WEB_CLIENT_ID',
      scope: 'openid',
      redirectUri: CALLBACK,
      fallbackRedirectUri: GAME_PAGE,
    },
    x: {
      provider: 'X',
      authorizeEndpoint: 'https://x.com/i/oauth2/authorize',
      // APP: the OAuth 2.0 client ID of your X app.
      clientId: 'YOUR_X_CLIENT_ID',
      scope: 'users.read tweet.read',
      redirectUri: CALLBACK,
      fallbackRedirectUri: GAME_PAGE,
    },
    steam: { provider: 'STEAM', redirectUri: CALLBACK, fallbackRedirectUri: GAME_PAGE },
    // Apple signs in with Apple JS in its own window. It never moves the page.
    // APP: add your game domain to your Services ID, and register `CALLBACK` as one of its Return URLs.
    // Apple takes only `https:` pages on a domain name, so test Apple sign-in on a deployed page.
    // With `appleRelayUri` in `createLogin` (see `initialization.ts`), Apple returns to the Hive Axyl relay instead.
    // Then register the relay as the Return URL, and the recipe uses `authorizeEndpoint` and `fallbackRedirectUri`.
    apple: {
      provider: 'SIGNIN_APPLE',
      authorizeEndpoint: 'https://appleid.apple.com/auth/authorize',
      // APP: your Apple Services ID.
      clientId: 'YOUR_APPLE_SERVICES_ID',
      scope: 'name email',
      redirectUri: CALLBACK,
      fallbackRedirectUri: GAME_PAGE,
    },
  } satisfies Record<string, ProviderSignIn>
}

/**
 * Prepares the sign-in screen. Call it each time the screen opens.
 * Apple JS must be loaded before the player clicks "Sign in with Apple", so start loading it now.
 */
export function showSignInScreen(): void {
  // APP: allow `https://appleid.cdn-apple.com` in the `script-src` of your Content Security Policy.
  // APP: skip this if you offer no Apple sign-in, or if Apple sign-in goes through `appleRelayUri`.
  // APP: Apple JS is a third-party script. On page load, call this only after `finishProviderRedirect()` returned.
  preloadAppleJs()
}

/**
 * Wires a "Sign in with ..." button.
 * Call `login.provider()` in the click handler before any `await`. Only synchronous checks may run before it.
 * Browsers open the sign-in window only during the click.
 */
export function createProviderButton(login: Login, screens: GameScreens, p: ProviderSignIn) {
  // The sign-in window has no time limit. A Cancel button on your sign-in screen stops the wait.
  // It closes the SDK sign-in window. Apple JS keeps its own window open, and the recipe ignores its later answer.
  let running: AbortController | null = null
  return {
    async onClick(): Promise<void> {
      // A second click while the window is open shares the first call and its signal. Ignore it here.
      if (running) return
      const ctrl = new AbortController()
      running = ctrl
      try {
        report(screens, await login.provider(p, { signal: ctrl.signal }))
      } finally {
        // `login.provider()` rejects on an app code error. Release the button then too.
        running = null
      }
    },
    // APP: call it from your Cancel button.
    /** Stops the sign-in. The result is then a `failure` with `Cancelled`. An Apple JS window stays open. */
    cancel(): void {
      running?.abort()
    },
  }
}

/**
 * Finishes a sign-in that moved the whole page. Call it once when the game page loads, after `initAxyl`.
 * It does nothing on a normal visit.
 */
export async function finishProviderRedirect(login: Login, screens: GameScreens): Promise<void> {
  const r = await login.completeProviderRedirect()
  if (r !== null) report(screens, r)
}

/**
 * Tells the player to open a regular browser before they try a provider.
 * Some providers refuse to sign in inside in-app browsers.
 */
export function warnInAppBrowser(screens: GameScreens): void {
  if (detectEnvironment().inAppBrowser !== null) {
    // APP: show your own "Open in your browser" message.
    screens.showError('open_in_browser')
  }
}

function report(screens: GameScreens, r: ProviderLoginResult): void {
  switch (r.kind) {
    case 'success':
      enterGameUnlessBlocked(screens, r)
      return
    case 'redirecting':
      // The page is moving to the provider. Do nothing more on this page.
      // APP: keep the sign-in screen usable. The page can stay after a "Stay" answer to `beforeunload`, or come back with Back.
      return
    case 'businessOutcome':
      // `user_canceled`: the player closed the window or declined. Return to the sign-in screen without an error.
      // APP: inside a portal iframe (`detectEnvironment().inIframe`), a `sandbox` without `allow-same-origin`
      // also ends this way, even after the player signed in. Inside an iframe, the sign-in screen may show the game's address
      // and suggest opening it outside the portal, as a hint next to the buttons, not as an error.
      if (r.code === 'user_canceled') return
      // APP: `provider_config_not_found` or `provider_client_info_not_exists` means the console
      // has no settings for this provider. For Steam, `provider_request_failed` often means the console holds
      // a user Web API Key instead of a Publisher Web API Key.
      // Show a message for other codes. Log the ones you do not recognise with `r.step`.
      screens.showError(r.code)
      return
    case 'failure':
      // APP: `WebAuthPopupBlocked` in `r.error.externalCode` means the window could not open.
      // Ask the player to allow popups or to open a regular browser.
      // Inside a portal iframe (`detectEnvironment().inIframe`) this is the result even with `fallbackRedirectUri`.
      // The portal's `sandbox` or opener policy can block the window, so allowing popups may not help.
      // Ask the player to open the game outside the portal, in its own tab, and show the game's address.
      // A guest does not carry over there. Suggest linking a sign-in provider first.
      // Show this portal message only for `WebAuthPopupBlocked`. Other codes keep their own message.
      // `Cancelled` means your signal stopped it. Offer a retry button.
      // APP: Apple JS adds these `externalCode` values.
      // `Auth_AppleJsNotLoaded`: Apple JS is still loading. Ask the player to try again in a moment.
      // `Auth_AppleStateMismatch`: Apple's answer did not belong to this sign-in. Offer a retry.
      // `Auth_AppleResponseInvalid`: Apple's answer was incomplete. Offer a retry.
      // `Auth_AppleJsStartFailed`: Apple JS failed to start the sign-in. Offer a retry.
      // `Auth_AppleAuthorizationError`: Apple returned an error without a usable code. Offer a retry.
      // `WebAuthPopupBlocked` also comes from Apple JS. It never moves the page, so ask the player to allow popups.
      // APP: `externalCode` can also hold the provider's own error code.
      // Map values you do not know to a general message.
      screens.showError(r.error.externalCode ?? r.error.code)
      return
    default:
      // A future SDK version may add a result kind. Offer a retry.
      screens.showError('unknown')
  }
}
