// Login recipe: guest, username, custom and provider sign-in, account linking and sign-out.
// Copy this source into your game. It is not part of the npm package.
// It holds only the call order. SDK functions create the PKCE values and the `deviceKey`,
// open the sign-in window and check the provider callback.
// Apple sign-in uses Apple JS by default, which opens its own window. The recipe then checks Apple's answer itself.
// The `token` module exchanges the authorization code and registers the session.
// This file imports only types. Remove the type annotations and load it with `<script type="module">` on a page without a build tool.
import type { AxylClient, AxylResult, HiveError, RedirectSignIn } from '@com2usplatform/hiveaxyl'
import type {
  AuthModule,
  LoginResponse,
  OpenIdCallback,
  Pkce,
  ProviderId,
  SignInPopup,
  SignInRequest,
} from '@com2usplatform/hiveaxyl/auth'
import type { TokenModule } from '@com2usplatform/hiveaxyl/token'

type LoginClient = Pick<
  AxylClient<{ auth: AuthModule; token: TokenModule }>,
  'auth' | 'token' | 'session' | 'isDisposed'
>

/**
 * Credential that signs the same guest back in.
 * Treat it like a password.
 * Keep it in `sessionStorage` under your game's own key. After a reload, the player's "Play as guest" press
 * then signs the same guest back in. It goes away when the tab is closed for good. Do not log it.
 * Do not put it in `localStorage`, IndexedDB or cookies: it stays valid until the first link, and on a shared computer
 * the next person would get the account. Browsers have no secure storage, and any script on the page can read it.
 * It stops working once the player links a first sign-in provider. After that, `restoreGuest()` returns `invalid_guest_token`.
 */
export interface GuestCredential {
  readonly guestPlayerId: string
  /** Sensitive. Do not log it. Keep it in memory or `sessionStorage`, nowhere else. */
  readonly guestToken: string
}

/**
 * The step where a recipe call stopped. Every `businessOutcome` and `failure` has one.
 * Use it to tell what already happened on the server.
 * - `validate`: the recipe checked the input or the sign-in state, or found another call running. Nothing was sent.
 * - `createGuest`, `restoreGuest`, `logIn`, `signUp`, `customLogin`, `loginProvider`: the sign-in request.
 *   After `signUp` the account may exist. After `customLogin` the grant key may be used.
 * - `acquireCredential`: the provider sign-in window, or the exchange of the provider's code.
 * - `sessionSetup`: the token request after a successful sign-in request. The account exists,
 *   and a one-time credential such as a grant key is already used.
 * - `link`: the link request. `logout`: the sign-out request.
 * A call stopped before its first request, for example by a `signal` that was already aborted,
 * reports the step it was about to start. `linkProvider()` reports `validate` instead, because it opens no window first.
 * Only `validate` promises that nothing was sent.
 * New steps may be added. Handle unknown ones in a default branch.
 */
export type LoginStep =
  | 'validate'
  | 'createGuest'
  | 'restoreGuest'
  | 'logIn'
  | 'signUp'
  | 'customLogin'
  | 'acquireCredential'
  | 'loginProvider'
  | 'sessionSetup'
  | 'link'
  | 'logout'

/**
 * Result of a recipe call. It has three branches:
 * - `success`: the call finished. Extra fields depend on the call.
 * - `businessOutcome`: the server answered with a business result code, including codes this SDK does not know yet. `code` is the server's code as is.
 *   A provider sign-in also uses it for `user_canceled`: the player closed the sign-in window or declined at the provider.
 * - `failure`: a network, server or browser problem.
 *   `Cancelled` means your `signal` stopped the call. The server may still have done the work.
 *   `Aborted` means another login or logout is still running, or the session changed during sign-in. Sign in again.
 *   `Internal` can mean the browser could not prepare the sign-in, for example when Web Crypto fails.
 * `businessOutcome` and `failure` say in `step` where the call stopped.
 *
 * Module calls have four branches. The recipe merges `outcome` and `unknownOutcome` into `businessOutcome`.
 * Show a message for each `code`. Keep and log codes you do not recognise.
 * Log only `kind`, `step`, `code` or `error.code`, `error.externalCode` and a failure's `error.traceId`. Never log the whole result.
 * The trace ID lets the server team find the request. It is not a credential.
 * A `guest()` result carries the guest credential, even on failure.
 */
export type LoginResult<T = object> =
  | ({ readonly kind: 'success' } & T)
  | { readonly kind: 'businessOutcome'; readonly code: string; readonly step: LoginStep }
  | { readonly kind: 'failure'; readonly error: HiveError; readonly step: LoginStep }

/** Options for every recipe call. */
export interface RecipeOptions {
  /**
   * Stops the call. The result is then a `failure` with `Cancelled`, and an open sign-in window closes.
   * A window whose link the browser cut, for example by a provider page's `Cross-Origin-Opener-Policy`, stays open.
   * Apple JS keeps its own window open. The recipe stops waiting and ignores a later answer from Apple.
   * A sign-in window has no time limit of its own. Pass `AbortSignal.timeout(ms)` to set one.
   * Safari before 16 lacks `AbortSignal.timeout`. There, abort an `AbortController` from `setTimeout`.
   * A repeated call that shares a running result also shares the first call's signal.
   */
  readonly signal?: AbortSignal
}

/**
 * Data of a successful sign-in, from `restoreGuest()`, `username()`, `custom()` or `provider()`.
 * `isBlock` is true when the player is restricted. Check it before gameplay starts.
 */
export interface SignedIn {
  readonly playerId: string
  readonly isBlock: boolean
}

/**
 * Data of a successful `username()`.
 * `isNewAccount` is true when this call created the account. A new account has `isBlock` false.
 */
export interface UsernameSignedIn extends SignedIn {
  readonly isNewAccount: boolean
}

/** Options for `guest()`. */
export interface GuestOptions extends RecipeOptions {
  /**
   * The grant key your game server got for creating a guest.
   * Pass one on every call when your game server can issue it.
   * The server checks a key whenever one is sent, so guest creation keeps working if the console starts to require keys later.
   * An empty or blank value is left out.
   * It lasts 60 seconds and works once. Sensitive. Do not log or persist.
   */
  readonly grantKey?: string
}

/** Options for `username()`. */
export interface UsernameOptions extends RecipeOptions {
  /**
   * The grant key your game server got for creating a username account.
   * Pass one on every call when your game server can issue it.
   * The server checks a key whenever one is sent, so sign-up keeps working if the console starts to require keys later.
   * The recipe sends it only with the sign-up request. An empty or blank value is left out.
   * It lasts 60 seconds and works once. Sensitive. Do not log or persist.
   */
  readonly grantKey?: string
}

/**
 * Data of a successful `guest()` sign-in.
 * `guest` is the credential that signs this guest back in. `isNewAccount` is always true.
 * A new guest has `isBlock` false. The guest creation response does not report a restriction.
 */
export interface GuestSignedIn extends SignedIn {
  readonly guest: GuestCredential
  readonly isNewAccount: boolean
}

/**
 * Data of a successful `restoreGuest()` sign-in. `isNewAccount` is always false.
 * It does not repeat the credential you passed in. Keep using the one you hold.
 */
export interface GuestRestored extends SignedIn {
  readonly isNewAccount: boolean
}

/**
 * Result of `guest()`.
 * On `success` it carries the new `guest` credential.
 * The guest account can exist even when the token request after it fails.
 * In that case the result still carries `guest`.
 * Keep it and call `restoreGuest()` with it instead of creating another guest.
 */
export type GuestLoginResult =
  | ({ readonly kind: 'success' } & GuestSignedIn)
  | (Exclude<LoginResult, { kind: 'success' }> & { readonly guest?: GuestCredential })

/**
 * Sign-in with Google, X or Apple through the OAuth 2.0 authorization code flow.
 * For Google and X, register both `redirectUri` and `fallbackRedirectUri` with the provider, character for character.
 *
 * Apple signs in with Apple JS by default. Apple JS opens Apple's sign-in window itself and never moves the page.
 * Call `preloadAppleJs()` when the sign-in screen opens, so Apple JS is ready at the click.
 * Register the game domain with your Apple Services ID, and `redirectUri` as one of its Return URLs.
 * With `appleRelayUri` in `createLogin`, Apple returns to the Hive Axyl relay instead,
 * which then sends the player to `redirectUri` or `fallbackRedirectUri`.
 * Apple rejects loopback addresses such as `127.0.0.1` or `localhost`, so test Apple sign-in on a deployed `https:` page.
 *
 * The provider client must be a web client with a client secret. The Hive Axyl server holds the secret and exchanges the code.
 */
export interface OAuthProviderSignIn {
  readonly provider: 'GOOGLE' | 'X' | 'SIGNIN_APPLE'
  /**
   * The provider's authorization endpoint, such as `https://accounts.google.com/o/oauth2/v2/auth`,
   * `https://x.com/i/oauth2/authorize` or `https://appleid.apple.com/auth/authorize`.
   * The recipe holds no provider endpoints of its own.
   * Apple JS does not use it. Only the Apple relay does.
   */
  readonly authorizeEndpoint: string
  /**
   * The OAuth client ID registered with the provider. It is not the Hive Axyl client ID.
   * For Apple it is the Services ID.
   */
  readonly clientId: string
  /**
   * The scopes to request, separated by spaces.
   * Google needs `openid` to return an ID token. X needs `users.read tweet.read` to read the user.
   * Apple takes `name`, `email` or both. Apple then asks the player to share them.
   * With Apple JS the default is `name email`. An empty scope asks for neither. Any other scope fails with `InvalidArgument`.
   * The recipe does not return the name or the email. It passes on only the code.
   */
  readonly scope?: string
  /**
   * The callback page for the popup, on the game origin, such as `https://game.example.com/callback.html`.
   * For Apple JS it must be an `https:` URL on a domain name, without `#` or user info,
   * and registered as a Return URL of the Services ID. The code exchange sends it again, character for character.
   * For the Apple relay it must not contain `|`.
   */
  readonly redirectUri: string
  /**
   * The game page that the provider returns to when the recipe signs in by moving the whole page.
   * The recipe does that when the browser blocks the popup or the page runs in an in-app browser.
   * Call `completeProviderRedirect()` when this page loads.
   * Without it, a blocked popup ends as a `failure` with the code `Unavailable` and the `externalCode` `WebAuthPopupBlocked`.
   * Inside an iframe the recipe never moves the page, and a blocked popup ends the same way.
   * The move would load the provider inside the frame, and providers such as Google refuse to show their sign-in pages there.
   * Apple JS never moves the page, so it does not use this value.
   */
  readonly fallbackRedirectUri?: string
}

/**
 * Sign-in with Steam through Steam OpenID 2.0. Steam needs no redirect URI registration.
 * The Hive Axyl console needs a Steamworks Publisher Web API Key.
 * Steam rejects a user Web API Key, so the sign-in ends with `businessOutcome` `provider_request_failed`.
 */
export interface SteamProviderSignIn {
  readonly provider: 'STEAM'
  /**
   * The callback page for the popup, on the game origin. Steam returns to this page.
   * Use the address the page loads at without a redirect, character for character.
   * OpenID 2.0 requires the arrival address to match `openid.return_to`. If your host redirects it,
   * for example by removing `.html` or adding a trailing `/`, Steam sign-in fails with `WebAuthCallbackURLParseFailed`.
   */
  readonly redirectUri: string
  /**
   * The game page for a sign-in that moves the whole page. See `OAuthProviderSignIn.fallbackRedirectUri`.
   * Like `redirectUri`, use the address the page loads at without a redirect.
   */
  readonly fallbackRedirectUri?: string
}

/** A provider for `provider()` and `linkProvider()`. */
export type ProviderSignIn = OAuthProviderSignIn | SteamProviderSignIn

/** Data of a successful `provider()` or `completeProviderRedirect()`. `provider` is the provider the player signed in with. */
export interface ProviderSignedIn extends SignedIn {
  readonly provider: ProviderId
}

/**
 * Result of `provider()`.
 * `redirecting` means the page is moving to the provider. Do nothing more on this page.
 * When the game page loads again, call `completeProviderRedirect()`.
 * The page can still stay, for example when the player answers "Stay" to a `beforeunload` prompt,
 * or comes back with the browser's Back button. Keep the sign-in screen usable, so the player can try again.
 */
export type ProviderLoginResult = LoginResult<ProviderSignedIn> | { readonly kind: 'redirecting' }

/**
 * Result of `completeProviderRedirect()`.
 * Results after the saved sign-in values were read name the `provider`, because only the page that left knew it.
 * A return without saved values has no `provider`.
 * Nor does a result decided from the address alone: a cancel or an error at the provider,
 * or a callback address that cannot be read (`WebAuthCallbackURLParseFailed`).
 */
export type ProviderReturnResult =
  | Extract<LoginResult<ProviderSignedIn>, { kind: 'success' }>
  | (Exclude<LoginResult, { kind: 'success' }> & { readonly provider?: ProviderId })

/** Data of a successful `linkProvider()`. */
export interface Linked {
  /** The signed-in player that the provider account is now linked to. */
  readonly playerId: string
  readonly providerId: string
  /** The player's ID at the provider. It is not a credential. */
  readonly providerUserId: string
}

/**
 * Result of `logout()`.
 * `sessionCleared` is true when this call signed the player out on this page.
 * It does not follow from `kind`: a failed request can still clear the session,
 * and a successful one does not clear a session that changed while the request ran.
 * It does not say whether a session exists now. The session can also end for another reason during the call,
 * for example when the server rejects the token refresh. Read `axyl.session.isSignedIn()` for the current state.
 * A sign-out that the app sends with `axyl.auth.logoutPlayer()` at the same time also counts as cleared.
 */
export type LogoutResult = LoginResult & { readonly sessionCleared: boolean }

/** Options for `createLogin`. */
export interface LoginOptions {
  /** Client ID from the console. Use the same value you passed to `createAxyl`. */
  readonly clientId: string
  /**
   * Optional. Leave it out to sign in with Apple through Apple JS, the default.
   * Set it to sign in with Apple through the Hive Axyl relay instead: `/auth/v1/provider/callback` on the Hive Axyl server,
   * such as `https://core-api.hiveaxyl.com/auth/v1/provider/callback`.
   * Apple then returns to the relay, and the relay sends the player to the game page.
   * Register it as a Return URL of your Apple Services ID. Apple accepts only an `https:` address there.
   * It must not have a `#` or use a loopback host such as `localhost` or `127.0.0.1`.
   * Otherwise an Apple sign-in ends as a `failure` with `InvalidArgument`.
   */
  readonly appleRelayUri?: string
}

/** Providers that the page-moving sign-in can come back from. */
const REDIRECT_PROVIDERS = new Set<string>(['GOOGLE', 'X', 'STEAM', 'SIGNIN_APPLE'])
const STEAM_LOGIN = 'https://steamcommunity.com/openid/login'
const OPENID_NS = 'http://specs.openid.net/auth/2.0'
const OPENID_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select'

/**
 * Creates the login flow for one SDK client.
 * The client must register the `auth` and `token` modules.
 * Create one login flow per client and share it across your game.
 *
 * Only one login, link or logout runs at a time:
 * - A repeated call with the same input shares the running result.
 * - Any other call made meanwhile resolves to `failure` with the code `Aborted`.
 * - Each flow counts only its own calls. Two flows on one client do not stop each other,
 *   so one sign-in can replace the other or end it with `Aborted`.
 * - A call still runs while the session `change` listeners it caused run.
 *   A different call made from such a listener resolves to `Aborted`.
 *   This also holds for a `queueMicrotask` or `Promise.resolve().then` scheduled there.
 *   Chain the next call on the promise the first call returned.
 *   If it must start from the listener, defer it with `setTimeout`.
 * - An event from elsewhere, such as an expired session, can arrive while a call runs,
 *   for example while its sign-in window is open. A different call resolves to `Aborted` until that call ends.
 *
 * @example
 * const login = createLogin(axyl, { clientId })
 * const r = await login.guest()
 * // Keep the guest credential even if sign-in failed after the account was created.
 * if (r.guest) guest = r.guest
 */
export function createLogin(axyl: LoginClient, { clientId, appleRelayUri }: LoginOptions) {
  // Players can press login and logout buttons in quick succession. Run only one at a time.
  // The same task with the same input shares the running result. Anything else is rejected.
  // `secret` is held only while the task runs, for comparison.
  let running: {
    readonly key: string
    readonly secret: string | undefined
    readonly promise: Promise<unknown>
  } | null = null
  /**
   * Turns an error thrown during a recipe task into its result at `step`.
   * An `AxylUsageError` that is not from `dispose()` means the game code must change, so it is thrown again.
   */
  const thrown = (e: unknown, step: LoginStep): Failure => {
    if (isUsageError(e)) {
      // The call started before `dispose()`, so it ends as `Cancelled`, like an SDK request cut short by it.
      if (axyl.isDisposed()) {
        return fail('Cancelled', 'The client was disposed during the call.', step)
      }
      throw e
    }
    // Anything else is a browser problem, such as Web Crypto failing while the PKCE values are made.
    // The error name stays in `message` so a bug in copied recipe code is not hidden.
    const name = e instanceof Error ? e.name : typeof e
    return fail('Internal', `Could not prepare the sign-in in this browser (${name}).`, step)
  }
  // Every result type `R` has a `failure` branch, so the rejection can be returned as `R`.
  // `at.step` follows the task, so an error thrown midway is reported at the step it reached.
  const once = <
    R extends LoginResult | GuestLoginResult | ProviderLoginResult | ProviderReturnResult | null,
  >(
    task: Task,
    start: (at: Progress, signal: AbortSignal | undefined) => Promise<R>,
  ): Promise<R> => {
    const { key, first, secret } = task
    const signal = task.options?.signal
    const at: Progress = { step: first }
    // A call made after `dispose()` rejects with `AxylUsageError`, like an SDK module method.
    // It is checked first, so an aborted `signal` or a running call cannot turn it into a result.
    // The recipe imports only types, so it takes the SDK's own error: module methods such as `auth.deviceKey()` throw it after `dispose()`.
    // A stand-in client whose `deviceKey()` does not throw still gets an error with the same name.
    if (axyl.isDisposed()) {
      return new Promise<R>((_, reject) => {
        axyl.auth.deviceKey()
        reject(Object.assign(new Error('The client was disposed.'), { name: 'AxylUsageError' }))
      })
    }
    if (running?.key === key && running.secret === secret) {
      return running.promise as Promise<R>
    }
    if (running) {
      // Nothing was sent, so it is reported at `validate`.
      const busy = fail('Aborted', 'Another login or logout is in progress.', 'validate')
      return Promise.resolve(busy as R)
    }
    // A `signal` that has already stopped is checked after the running call, so a repeated call still shares that result.
    const onAbort = task.onAbort === undefined ? cancelled(first) : task.onAbort
    // Register the call before it starts. Its first request logs at once, and the app logger can then call the recipe again.
    // That call must see this one running. Only this call's own end clears it.
    let begin!: () => void
    const promise = new Promise<R>((resolve) => {
      begin = () =>
        resolve(signal?.aborted && onAbort !== null ? (onAbort as R) : start(at, signal))
    })
      .catch((e: unknown): R => thrown(e, at.step) as R)
      .finally(() => {
        if (running === entry) running = null
      })
    const entry = { key, secret, promise }
    running = entry
    begin()
    return promise
  }

  /** The fields that every Hive Axyl sign-in request carries. Each request needs its own PKCE pair. */
  const pkceBody = (pkce: Pkce, deviceKey: string) => ({
    clientId,
    codeChallenge: pkce.challenge,
    codeChallengeMethod: pkce.challengeMethod,
    deviceKey,
  })

  /**
   * Exchanges the authorization code from a sign-in response for tokens and registers the session.
   * An empty code ends at the sign-in step that returned it, as in the Hive Axyl SDK for Unity.
   * An empty `playerId` ends there too. The session needs it, so a token is not requested without it.
   */
  async function finish(
    data: Pick<LoginResponse, 'authorizationCode' | 'playerId'>,
    verifier: string,
    signal: AbortSignal | undefined,
    at: Progress,
  ): Promise<LoginResult<{ readonly playerId: string }>> {
    if (!isFilled(data.authorizationCode)) {
      return fail(
        'Internal',
        'The sign-in succeeded without an authorization code, so no token could be issued.',
        at.step,
      )
    }
    if (!isFilled(data.playerId)) {
      return fail(
        'Internal',
        'The sign-in succeeded without a player ID, so no session could start.',
        at.step,
      )
    }
    at.step = 'sessionSetup'
    const t = await axyl.token.issueToken(
      {
        body: {
          grantType: 'authorization_code',
          clientId,
          authorizationCode: data.authorizationCode,
          codeVerifier: verifier,
        },
      },
      { playerId: data.playerId, ...callOptions(signal) },
    )
    if (t.kind !== 'success') return toLoginResult(t, at.step)
    return { kind: 'success', playerId: t.data.playerId }
  }

  /** Finishes a sign-in with an existing account and adds the restriction flag from the sign-in response. */
  async function finishSignedIn(
    data: Pick<LoginResponse, 'authorizationCode' | 'playerId' | 'isBlock'>,
    verifier: string,
    signal: AbortSignal | undefined,
    at: Progress,
  ): Promise<LoginResult<SignedIn>> {
    const done = await finish(data, verifier, signal, at)
    // The specification requires `isBlock`. A missing value reads as `false`, like a C# `bool` in the Unity SDK, so the type stays boolean.
    return done.kind === 'success' ? { ...done, isBlock: data.isBlock === true } : done
  }

  /** Exchanges a provider authorization code for the provider's token on the Hive Axyl server. */
  async function exchange(
    providerId: ProviderId,
    providerCode: string,
    redirectUri: string,
    codeVerifier: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<Credential | Stopped> {
    const x = await axyl.auth.exchangeProviderToken(
      {
        body: {
          providerId,
          providerCode,
          redirectUri,
          ...(codeVerifier !== undefined && { codeVerifier }),
        },
      },
      callOptions(signal),
    )
    if (x.kind !== 'success') return toLoginResult(x, 'acquireCredential')
    return {
      kind: 'credential',
      providerId,
      providerUserId: x.data.providerUserId,
      providerToken: x.data.providerToken,
    }
  }

  /**
   * The Apple relay, or the failure that says why Apple sign-in cannot start.
   * Apple sends the code to the relay. The relay takes the game page from the part of `state` before `|`,
   * and sends the code and the rest of `state` there.
   */
  function appleRelay(...pages: (string | undefined)[]): string | Failure {
    if (!isFilled(appleRelayUri) || !isRelayUrl(appleRelayUri)) {
      return fail(
        'InvalidArgument',
        'Apple sign-in needs appleRelayUri in createLogin: an absolute https: URL without #, not on a loopback host.',
        'acquireCredential',
      )
    }
    if (pages.some((page) => page?.includes('|'))) {
      return fail(
        'InvalidArgument',
        'redirectUri and fallbackRedirectUri must not contain | for Apple sign-in.',
        'acquireCredential',
      )
    }
    return appleRelayUri
  }

  /**
   * Gets a provider credential.
   * It opens the sign-in window before its first `await`, so call it on the first line of a recipe task.
   * A blocked window comes back as `blocked` with its route, so the caller can move the page instead.
   */
  async function acquire(
    p: ProviderSignIn,
    signal: AbortSignal | undefined,
  ): Promise<Credential | Stopped | Blocked> {
    if (p.provider === 'SIGNIN_APPLE') {
      // Without a relay, Apple JS opens its own window. It starts before the first `await` here.
      if (appleRelayUri === undefined) return appleJsCredential(p, signal)
      // A wrong Apple setting fails before the window opens.
      const relay = appleRelay(p.redirectUri, p.fallbackRedirectUri)
      if (typeof relay !== 'string') return relay
      return signInPopup(axyl.auth.openSignInPopup(), { via: 'relay', p, relay }, signal)
    }
    const popup = axyl.auth.openSignInPopup()
    if (p.provider === 'STEAM') return signInPopup(popup, { via: 'steam', p }, signal)
    // This PKCE pair belongs to the provider's code exchange. The Hive Axyl login makes its own pair.
    let pkce: Pkce | undefined
    try {
      pkce = await unlessAborted(axyl.auth.newPkce(), signal)
    } catch (e) {
      popup.close()
      throw e
    }
    // A cancel while the hash runs closes the window now, instead of when the hash ends.
    if (pkce === undefined) {
      popup.close()
      return cancelled('acquireCredential')
    }
    return signInPopup(popup, { via: 'pkce', p, pkce }, signal)
  }

  /**
   * Signs in at Apple with Apple JS and exchanges Apple's code for a provider credential.
   * Apple JS starts at once, so call it before any `await`.
   * Apple JS has no provider PKCE, so the exchange sends no verifier.
   * It names `redirectUri`, the page that Apple JS passed to Apple.
   */
  async function appleJsCredential(
    p: OAuthProviderSignIn,
    signal: AbortSignal | undefined,
  ): Promise<Credential | Stopped> {
    const answer = await unlessAborted(startAppleJs(p), signal)
    if (answer === undefined) return cancelled('acquireCredential')
    // Apple JS does not watch `dispose()`. A client disposed while Apple's window was open ends here,
    // once Apple answers or the player closes the window.
    if (axyl.isDisposed()) {
      return fail('Cancelled', 'The client was disposed during the call.', 'acquireCredential')
    }
    if (answer.kind !== 'appleCode') return answer
    return exchange('SIGNIN_APPLE', answer.code, p.redirectUri, undefined, signal)
  }

  /**
   * Sends the open sign-in window to the provider along `route`, and turns the answer into a provider credential.
   * For Apple, the Hive Axyl server exchanges the code with the relay as `redirectUri`, because Apple sent the code there.
   */
  async function signInPopup(
    popup: SignInPopup,
    route: Route,
    signal: AbortSignal | undefined,
  ): Promise<Credential | Stopped | Blocked> {
    const page = route.p.redirectUri
    if (route.via === 'steam') {
      const r = await popup.signIn(providerRequest(route, page), callOptions(signal))
      return r.kind === 'success' ? steamCredential(r.data) : notSignedIn(r, route)
    }
    const r = await popup.signIn(providerRequest(route, page), callOptions(signal))
    if (r.kind !== 'success') return notSignedIn(r, route)
    return route.via === 'relay'
      ? exchange(route.p.provider, r.data.code, route.relay, undefined, signal)
      : exchange(route.p.provider, r.data.code, page, route.pkce.verifier, signal)
  }

  /** Signs in with a provider credential and registers the session. */
  async function signInWith(
    c: Credential,
    signal: AbortSignal | undefined,
    at: Progress,
  ): Promise<LoginResult<ProviderSignedIn>> {
    at.step = 'loginProvider'
    // This PKCE pair belongs to the Hive Axyl authorization code, not to the provider.
    const pkce = await axyl.auth.newPkce()
    const r = await axyl.auth.loginProvider(
      {
        body: {
          providerId: c.providerId,
          providerUserId: c.providerUserId,
          providerToken: c.providerToken,
          ...pkceBody(pkce, axyl.auth.deviceKey()),
        },
      },
      callOptions(signal),
    )
    if (r.kind !== 'success') return toLoginResult(r, at.step)
    const done = await finishSignedIn(r.data, pkce.verifier, signal, at)
    return done.kind === 'success' ? { ...done, provider: c.providerId } : done
  }

  /**
   * Moves the whole page to the provider along the route of the blocked window, and back to `page`.
   * Returns `redirecting` once the page starts to move.
   */
  function redirect(route: Route, page: string): ProviderLoginResult {
    const failed = axyl.auth.startRedirectSignIn({
      ...providerRequest(route, page),
      provider: route.p.provider,
      ...(route.via === 'pkce' && { codeVerifier: route.pkce.verifier }),
    })
    return failed === undefined
      ? { kind: 'redirecting' }
      : { kind: 'failure', error: failed.error, step: 'acquireCredential' }
  }

  /** Finishes the sign-in from the values a page-moving sign-in brought back. */
  async function returnFrom(
    d: RedirectSignIn,
    provider: ProviderId,
    signal: AbortSignal | undefined,
    at: Progress,
  ): Promise<LoginResult<ProviderSignedIn>> {
    // Apple sent the code to the relay, so the exchange names the relay, not the game page.
    const relay = provider === 'SIGNIN_APPLE' ? appleRelay() : d.redirectUri
    if (typeof relay !== 'string') return relay
    const got =
      d.protocol === 'steamOpenId'
        ? steamCredential(d)
        : await exchange(provider, d.code, relay, d.codeVerifier, signal)
    if (got.kind !== 'credential') return got
    return signInWith(got, signal, at)
  }

  /** Signs a guest back in with `loginGuest`. The result does not repeat the credential. */
  async function signInGuest(
    guest: GuestCredential,
    signal: AbortSignal | undefined,
    at: Progress,
  ): Promise<LoginResult<GuestRestored>> {
    const pkce = await axyl.auth.newPkce()
    const r = await axyl.auth.loginGuest(
      {
        body: {
          guestPlayerId: guest.guestPlayerId,
          guestToken: guest.guestToken,
          ...pkceBody(pkce, axyl.auth.deviceKey()),
        },
      },
      callOptions(signal),
    )
    if (r.kind !== 'success') return toLoginResult(r, at.step)
    const done = await finishSignedIn(r.data, pkce.verifier, signal, at)
    return done.kind === 'success' ? { ...done, isNewAccount: false } : done
  }

  return {
    /**
     * Signs in as a new guest.
     * Use the returned `guest` to sign the same guest back in while this tab is open.
     * Once the server has returned a usable guest credential, every later result carries `guest`, even a `businessOutcome` or a `failure`.
     * Keep that `guest` and call `restoreGuest()` instead of creating another guest.
     * - `success`: the new guest is signed in. `isBlock` is false and `isNewAccount` is true.
     * - `businessOutcome` with `grant_required_missing`: the console requires a grant key for new accounts.
     *   Get one from your game server and pass it as `grantKey`.
     * - `businessOutcome` with `invalid_grant_key`: the grant key expired, was used or is wrong. Get a fresh one.
     * - `failure` with `InvalidArgument` and `step` `createGuest`: the server refused the request's format,
     *   for example a `grantKey` in the wrong format. Pass the key exactly as your game server got it.
     * - `businessOutcome`: the server refused. With `step` `sessionSetup` the guest exists.
     * - `failure` with `Internal` and `step` `createGuest`, without `guest`: the server reported an internal error or sent a broken answer,
     *   its answer lacked a guest token or a player ID, or the browser could not prepare the sign-in.
     * - `failure` with `Internal` and `step` `createGuest`, with `guest`: the server's answer lacked an authorization code.
     *   The guest exists, so keep `guest`.
     * - `failure` with `Aborted` and `step` `validate`: another recipe call, such as a login or a link, is running. Nothing was sent.
     * - `failure` with `Aborted` and `step` `sessionSetup`: the session changed while the tokens were issued. Sign in again.
     * - `failure` with `Cancelled`: your `signal` or `dispose()` stopped it.
     * - Any other `failure`: a network, server or browser problem.
     * Once the guest creation request was sent, the server may have used the grant key. Get a fresh key before you try again.
     */
    guest: (options?: GuestOptions) =>
      once(
        {
          key: 'guest',
          first: 'createGuest',
          options,
          secret: isFilled(options?.grantKey) ? options.grantKey : '',
        },
        async (at, signal): Promise<GuestLoginResult> => {
          const givenKey = options?.grantKey
          const grantKey = isFilled(givenKey) ? givenKey : undefined
          const pkce = await axyl.auth.newPkce()
          const g = await axyl.auth.createGuest(
            {
              body: {
                ...pkceBody(pkce, axyl.auth.deviceKey()),
                ...(grantKey !== undefined && { grantKey }),
              },
            },
            callOptions(signal),
          )
          if (g.kind !== 'success') return toLoginResult(g, at.step)
          // Without a guest token the account could never be restored, so do not sign in to it.
          if (!isFilled(g.data.guestToken)) {
            return fail(
              'Internal',
              'Guest creation returned no guest token, so the account could never be restored.',
              at.step,
            )
          }
          // Without a player ID the credential could not sign the guest back in.
          if (!isFilled(g.data.playerId)) {
            return fail(
              'Internal',
              'Guest creation returned no player ID, so the account could never be restored.',
              at.step,
            )
          }
          const guest: GuestCredential = {
            guestPlayerId: g.data.playerId,
            guestToken: g.data.guestToken,
          }
          // The account exists from here on. Every result keeps the credential, even one from a thrown error.
          let done: LoginResult<{ readonly playerId: string }>
          try {
            done = await finish(g.data, pkce.verifier, signal, at)
          } catch (e) {
            return { ...thrown(e, at.step), guest }
          }
          return done.kind === 'success'
            ? { ...done, guest, isBlock: false, isNewAccount: true }
            : { ...done, guest }
        },
      ),

    /**
     * Signs the same guest back in with the credential from `guest()`.
     * The result does not repeat the credential. Keep the one you hold.
     * - `success`: the player is signed in. Check `isBlock` before gameplay starts. `isNewAccount` is false.
     * - `businessOutcome` with `invalid_guest_token`: this credential no longer signs in.
     *   Linking a first sign-in provider has this effect. Offer that provider's sign-in instead.
     * - `businessOutcome` with another code: the server refused.
     * - `failure` with `Aborted` and `step` `validate`: another recipe call, such as a login or a link, is running. Nothing was sent.
     * - `failure` with `InvalidArgument` and `step` `validate`: `guest` is missing, or its `guestPlayerId` or `guestToken` is blank. Nothing was sent.
     * - `failure` with `Aborted` and `step` `sessionSetup`: the session changed while the tokens were issued. Sign in again.
     * - `failure` with `Cancelled`: your `signal` or `dispose()` stopped it.
     * - Any other `failure`: a network, server or browser problem.
     */
    restoreGuest: (guest: GuestCredential, options?: RecipeOptions) =>
      once(
        {
          // A page without type checks can pass `null`. The task below then ends at `validate` instead of throwing here.
          key: `restoreGuest:${String(guest?.guestPlayerId)}`,
          first: 'restoreGuest',
          options,
          secret: guest?.guestToken,
        },
        async (at, signal) => {
          if (!isFilled(guest?.guestPlayerId) || !isFilled(guest?.guestToken)) {
            return fail('InvalidArgument', 'The guest credential is incomplete.', 'validate')
          }
          return signInGuest(guest, signal, at)
        },
      ),

    /**
     * Signs in with a username and password, and creates the account when there is none yet.
     * Pass `password` exactly as the player typed it. The SDK hashes it with SHA-256 before sending.
     * Hashing it in the game as well makes every sign-in fail.
     * Never store or log the password.
     * The recipe signs in first. Only when the server answers `username_verify_failed` does it try to create the account.
     * The sign-in gives that same answer for an unknown username and for a wrong password, so only the sign-up can tell them apart.
     * If the sign-up answers `username_already_exists`, the username exists and the recipe returns the sign-in result.
     * - `success`: the player is signed in. Check `isBlock` before gameplay starts.
     *   `isNewAccount` true means this call created the account. Tell the player:
     *   a mistyped username also creates a new account.
     * - `businessOutcome` with `username_verify_failed`: the username exists and the password is wrong.
     *   If you passed a `grantKey`, the recipe also tried the sign-up, so the server may have used the key. Get a fresh one.
     * - `businessOutcome` with `grant_required_missing`: the console requires a grant key for new accounts.
     *   Get one from your game server and pass it as `grantKey`.
     * - `businessOutcome` with `invalid_grant_key`: the grant key expired, was used or is wrong. Get a fresh one.
     * - `businessOutcome` with `invalid_grant` and `step` `sessionSetup`: the server did not accept the sign-in code.
     *   Right after `auth.changeUsernamePassword()` the server may still be revoking the old sessions.
     *   Ask the player to sign in again a moment later.
     * - `failure` with `InvalidArgument` and `step` `validate`: `username` is blank, or `password` is empty or not a string. Nothing was sent.
     * - `failure` with `InvalidArgument` and another `step`: the server refused the request's format,
     *   for example a username that breaks its rules or a `grantKey` in the wrong format.
     * - `failure` with `Cancelled`: your `signal` stopped it. The account may already exist.
     * A result with `step` `signUp` means the sign-up was sent, and the server may already have used the grant key.
     * `sessionSetup` can follow the sign-in or the sign-up. Get a fresh key before you try again in both cases.
     */
    username: (username: string, password: string, options?: UsernameOptions) =>
      once(
        {
          key: `username:${String(username)}`,
          first: 'logIn',
          options,
          // Only strings go in, so a wrong type reaches the input check below instead of throwing here.
          secret: JSON.stringify([
            typeof password === 'string' ? password : null,
            typeof options?.grantKey === 'string' ? options.grantKey : null,
          ]),
        },
        async (at, signal): Promise<LoginResult<UsernameSignedIn>> => {
          if (!isFilled(username)) return fail('InvalidArgument', 'Enter a username.', 'validate')
          if (typeof password !== 'string' || password === '') {
            return fail('InvalidArgument', 'Enter a password.', 'validate')
          }
          // One device key goes with both the sign-in and the sign-up.
          const deviceKey = axyl.auth.deviceKey()
          const pkce = await axyl.auth.newPkce()
          const r = await axyl.auth.loginUsername(
            { body: { username, password, ...pkceBody(pkce, deviceKey) } },
            callOptions(signal),
          )
          if (r.kind === 'success') {
            const done = await finishSignedIn(r.data, pkce.verifier, signal, at)
            return done.kind === 'success' ? { ...done, isNewAccount: false } : done
          }
          if (r.kind !== 'outcome' || r.code !== 'username_verify_failed') {
            return toLoginResult(r, at.step)
          }
          // The refused sign-in already sent its challenge, so the sign-up makes a new pair.
          const created = await axyl.auth.newPkce()
          const givenKey = options?.grantKey
          const grantKey = isFilled(givenKey) ? givenKey : undefined
          at.step = 'signUp'
          const c = await axyl.auth.createUsername(
            {
              body: {
                username,
                password,
                ...pkceBody(created, deviceKey),
                ...(grantKey !== undefined && { grantKey }),
              },
            },
            callOptions(signal),
          )
          // The name is taken, so the sign-in failed on the password. Report the sign-in result.
          if (c.kind === 'outcome' && c.code === 'username_already_exists') {
            return toLoginResult(r, 'logIn')
          }
          if (c.kind !== 'success') return toLoginResult(c, at.step)
          const done = await finish(c.data, created.verifier, signal, at)
          return done.kind === 'success' ? { ...done, isBlock: false, isNewAccount: true } : done
        },
      ),

    /**
     * Signs in with a grant key that your game server issued after it authenticated the player.
     * The Hive Axyl server creates the account the first time that player signs in.
     * The game never makes the key and never holds server credentials.
     * A grant key lasts 60 seconds and works once. The recipe does not retry.
     * - `success`: the player is signed in. Check `isBlock` before gameplay starts.
     * - `businessOutcome` with `invalid_grant_key`: the key expired, was used or is wrong. Get a fresh key and call again.
     * - `businessOutcome` with `provider_not_supported`: the server does not support the provider the key was issued for.
     * - `businessOutcome` with `provider_config_not_found`: the console has no custom sign-in settings.
     * - `failure` with `InvalidArgument` and `step` `validate`: `grantKey` is blank. Nothing was sent.
     * - `failure` with `InvalidArgument` and `step` `customLogin`: the server refused the key's format.
     *   Pass the key exactly as your game server got it.
     * - Any other result: the server may already have used the key. Get a fresh key before you try again.
     *   `step` `sessionSetup` means the key was used for sure.
     */
    custom: (grantKey: string, options?: RecipeOptions) =>
      once(
        { key: 'custom', first: 'customLogin', options, secret: grantKey },
        async (at, signal): Promise<LoginResult<SignedIn>> => {
          if (!isFilled(grantKey)) {
            return fail(
              'InvalidArgument',
              'A grant key is required. Get a fresh key from your game server.',
              'validate',
            )
          }
          const pkce = await axyl.auth.newPkce()
          const r = await axyl.auth.loginCustomProvider(
            { body: { grantKey, ...pkceBody(pkce, axyl.auth.deviceKey()) } },
            callOptions(signal),
          )
          if (r.kind !== 'success') return toLoginResult(r, at.step)
          return finishSignedIn(r.data, pkce.verifier, signal, at)
        },
      ),

    /**
     * Signs in with Google, X, Steam or Apple.
     * Call it in a click handler before any `await`. Only synchronous checks run before it. Browsers open a window only during the click.
     * The recipe opens the sign-in window, checks the callback, has the Hive Axyl server verify the provider account,
     * and registers the session. A player without an account at this game gets a new one.
     * - `success`: the player is signed in. Check `isBlock` before gameplay starts.
     * - `redirecting`: the popup could not open, so the page is moving to the provider.
     *   This happens when the browser blocks popups or the page runs in an in-app browser, and you set `fallbackRedirectUri`.
     *   It never happens inside an iframe or with Apple JS.
     *   Call `completeProviderRedirect()` when the game page loads again.
     * - `businessOutcome` with `user_canceled`: the player closed the window or declined. Show no error.
     * - `businessOutcome` with another code: the server refused, for example `provider_config_not_found`
     *   when the console has no settings for this provider.
     * - `failure` with `Unavailable` and the `externalCode` `WebAuthPopupBlocked`: the popup could not open and there is no fallback.
     *   Inside an iframe, such as on a game portal, this is the result even with `fallbackRedirectUri`.
     *   Apple JS also ends this way when the browser blocks its window. It has no page move.
     * - `failure` with `Unavailable` and the `externalCode` `Auth_AppleJsNotLoaded`: Apple JS has not loaded yet.
     *   The recipe starts to load it. Ask the player to try again in a moment.
     *   Call `preloadAppleJs()` when the sign-in screen opens to avoid this.
     * - `failure` with `Unavailable` and no `externalCode`: the browser did not let the sign-in window
     *   or the page move to the provider. Ask the player to try again.
     * - `failure` with `InvalidArgument`: a setting is wrong.
     *   `redirectUri` or `fallbackRedirectUri` is not on the game page origin, or `authorizeEndpoint` is not an `https:` URL.
     *   For Apple JS, the Services ID in `clientId` is blank, `scope` holds something other than `name` and `email`,
     *   or `redirectUri` is not an `https:` URL on a domain name, has a `#` or has user info.
     *   These Apple JS checks run before anything opens, and `step` is `validate`.
     *   For the Apple relay, `appleRelayUri` is not an `https:` URL, has a `#`,
     *   or is on a loopback host such as `localhost` or `127.0.0.1`.
     *   For the Apple relay, `redirectUri` or `fallbackRedirectUri` also must not contain `|`.
     *   The Apple relay checks of `appleRelayUri` and `|` fail before the window opens.
     *   The other checks run after the window opens, and then the window closes.
     *   A page move checks every setting before the page moves.
     *   Only a page move checks that `fallbackRedirectUri` is on the game page origin.
     * - `failure` with `PermissionDenied` and the `externalCode` `Auth_AppleStateMismatch`: Apple's answer did not belong
     *   to this sign-in. Nothing was sent.
     * - `failure` with `FailedPrecondition`: another sign-in window is still open.
     *   With the `externalCode` `Auth_RedirectStateMissing`, the popup was blocked and the page could not move,
     *   because `sessionStorage` is blocked.
     * - `failure` with `Unknown`: the provider returned an error. `error.externalCode` holds the provider's code.
     *   With Apple JS, an error without a usable code gives `Auth_AppleAuthorizationError` instead.
     * - `failure` with `Internal` and the `externalCode` `Auth_AppleResponseInvalid`: Apple's answer lacked the code or the identity token.
     *   `Auth_AppleJsStartFailed` means Apple JS threw an error when the sign-in started.
     * - `failure` with `Cancelled`: your `signal` stopped it, or the client was disposed during the call.
     *   With Apple JS, a newer Apple JS sign-in on the page also ends an older one this way.
     *   After `dispose()`, an Apple JS sign-in ends once Apple answers or the player closes Apple's window.
     */
    provider: (p: ProviderSignIn, options?: RecipeOptions) =>
      once(
        { key: `provider:${providerKey(p)}`, first: 'acquireCredential', options },
        async (at, signal): Promise<ProviderLoginResult> => {
          const got = await acquire(p, signal)
          if (got.kind === 'blocked') {
            // In a frame, a page move would load the provider inside the frame. Providers such as Google refuse to show there.
            if (p.fallbackRedirectUri === undefined || inFrame()) {
              return { kind: 'failure', error: got.error, step: at.step }
            }
            if (signal?.aborted) return cancelled(at.step)
            return redirect(got.route, p.fallbackRedirectUri)
          }
          if (got.kind !== 'credential') return got
          return signInWith(got, signal, at)
        },
      ),

    /**
     * Finishes a provider sign-in that moved the whole page. Call it once when the game page loads.
     * It returns `null` when the page did not come back from a sign-in.
     * Otherwise the SDK removes the saved sign-in values from `sessionStorage` and the callback parameters from the address bar,
     * and the recipe signs the player in. It removes `code`, `state` and the other parameters of the sign-in answer.
     * Extra parameters that a provider adds, such as Google's `scope` or `authuser`, can stay.
     * Call it before your router changes the address. A router that rewrites `/play?code=...` first loses the sign-in,
     * and this call then returns `null`.
     * The results are those of `provider()`. A return in another tab or browser is a `failure` with the code `FailedPrecondition`
     * and the `externalCode` `Auth_RedirectStateMissing`.
     * Call it before any other recipe call on that page.
     * If it returns `failure` with `Aborted` and `step` `validate`, another recipe call was running. Call it again when that call ends.
     */
    completeProviderRedirect: (options?: RecipeOptions) =>
      once(
        // The return is read even when `signal` has already stopped. Only the requests after it take the signal.
        { key: 'completeProviderRedirect', first: 'acquireCredential', options, onAbort: null },
        async (at, signal): Promise<ProviderReturnResult | null> => {
          const back = axyl.auth.completeRedirectSignIn()
          if (back === null) return null
          if (back.kind !== 'success') return toLoginResult(back, at.step)
          const d = back.data
          if (!REDIRECT_PROVIDERS.has(d.provider)) {
            return fail(
              'Internal',
              'The page came back from a sign-in this recipe did not start.',
              at.step,
            )
          }
          const provider = d.provider as ProviderId
          // An error thrown from here on keeps the provider too.
          try {
            const r = await returnFrom(d, provider, signal, at)
            return r.kind === 'success' ? r : { ...r, provider }
          } catch (e) {
            return { ...thrown(e, at.step), provider }
          }
        },
      ),

    /**
     * Links a Google, X, Steam or Apple account to the signed-in player, so the player can sign in with it next time.
     * Use it to keep a guest: guest credentials last only until the tab closes.
     * Call it in a click handler before any `await`. Only synchronous checks run before it.
     * It does not move the page when the popup cannot open: the session lives in memory and would be lost.
     * - `success`: the account is linked. The first link makes the guest credential of this player stop working.
     *   Drop that credential when its `guestPlayerId` equals `playerId`.
     * - `businessOutcome` with `provider_owned_by_other`: the account belongs to another player.
     *   `provider_type_already_exists`: this player already has an account of that provider.
     *   For these two, let the player decide. Never switch accounts or unlink a provider automatically.
     *   `provider_already_connected`: this exact account is already linked. Treat it as done.
     *   After `provider_already_connected` or `provider_type_already_exists`, the guest credential of this player
     *   no longer works either. Drop it as for `success`, comparing with `session.playerId()` read before the call.
     * - `businessOutcome` with `user_canceled`: the player closed the window or declined. Show no error.
     * - `failure` with `Unavailable` and the `externalCode` `WebAuthPopupBlocked`: the popup could not open.
     *   Ask the player to allow popups, or to open the game in a regular browser.
     * - `failure` with `Unavailable` and no `externalCode`, with `step` `acquireCredential`: the window opened,
     *   but the browser did not let it move to the provider. The window closes. Ask the player to try again.
     * - `failure` with `Unavailable` and no `externalCode`, with `step` `link`: a token refresh failed without a verdict.
     *   Ask the player to try again.
     * - `failure` with `FailedPrecondition`: no player is signed in. The window does not open.
     *   Another sign-in window that is still open also gives this code, as in `provider()`.
     * - `failure` with `FailedPrecondition` and the `externalCode` `Auth_SessionChanged`: another sign-in or a sign-out
     *   replaced the session during the call. The link was not sent for the new player.
     * - `failure` with `InvalidArgument`: a setting is wrong. The checks and their order are those of `provider()`.
     *   The page never moves here, so the origin of `fallbackRedirectUri` is not checked.
     * - `failure` with `Unknown`: the provider returned an error. `error.externalCode` holds the provider's code.
     * - Apple JS adds the results `Auth_AppleJsNotLoaded`, `Auth_AppleJsStartFailed`, `Auth_AppleStateMismatch`,
     *   `Auth_AppleResponseInvalid` and `Auth_AppleAuthorizationError`, as in `provider()`.
     * - `failure` with `Aborted`: the session changed while the player signed in at the provider. Nothing was linked.
     *   A token refresh for the same player does not count as a change.
     * - `failure` with `Cancelled`: your `signal` or `dispose()` stopped it. The server may still have linked the account.
     *   The recipe does not return the player's links, and no SDK call looks them up during a session.
     *   If the player tries again with the same account,
     *   `provider_already_connected` means the earlier link went through.
     */
    linkProvider: (p: ProviderSignIn, options?: RecipeOptions) =>
      once(
        {
          key: `linkProvider:${providerKey(p)}`,
          first: 'acquireCredential',
          options,
          onAbort: cancelled('validate', 'link'),
        },
        async (at, signal): Promise<LoginResult<Linked>> => {
          const playerId = axyl.session.playerId()
          if (!axyl.session.isSignedIn() || playerId === null) {
            return fail(
              'FailedPrecondition',
              'No player is signed in, so there is no account to link.',
              'validate',
            )
          }
          // Any sign-in change while the provider window is open means the link could reach another player.
          let changed = false
          const stop = axyl.session.on('change', () => {
            changed = true
          })
          try {
            const got = await acquire(p, signal)
            if (got.kind === 'blocked') return { kind: 'failure', error: got.error, step: at.step }
            if (got.kind !== 'credential') return got
            if (signal?.aborted) return cancelled(at.step, 'link')
            if (axyl.isDisposed()) {
              return fail('Cancelled', 'The client was disposed during the call.', at.step)
            }
            // A session change is reported at the link step, as in the Hive Axyl SDK for Unity.
            at.step = 'link'
            if (changed || axyl.session.playerId() !== playerId) {
              return fail(
                'Aborted',
                'The session changed during provider sign-in. Nothing was linked.',
                at.step,
              )
            }
            const r = await axyl.auth.linkProvider(
              {
                body: {
                  providerId: got.providerId,
                  providerUserId: got.providerUserId,
                  providerToken: got.providerToken,
                },
              },
              callOptions(signal),
            )
            if (r.kind !== 'success') return toLoginResult(r, at.step)
            return {
              kind: 'success',
              playerId: r.data.playerId,
              providerId: r.data.providerId,
              providerUserId: r.data.providerUserId,
            }
          } finally {
            stop()
          }
        },
      ),

    /**
     * Signs the player out.
     * `sessionCleared` says whether this call signed the player out on this page.
     * Switch screens on `axyl.session.on('change')`, not on `kind`.
     * Show no error when `sessionCleared` is true. Otherwise show one only while `axyl.session.isSignedIn()` is still true.
     * - `success`: the server confirmed the sign-out. See `LogoutResult` for when `sessionCleared` is still false.
     * - `businessOutcome`: the server refused, and the session stays.
     *   A guest-only account gets `guest_signout_blocked`. An unknown code also keeps the session.
     * - `failure` with `FailedPrecondition`: no player is signed in. Nothing was sent.
     * - `failure` with `FailedPrecondition` and the `externalCode` `Auth_SessionChanged`: the sign-in state changed
     *   during the call, and this call did not clear it.
     * - `failure` with `Aborted`: another recipe call, such as a login or a link, is running. Nothing was sent, so the session stays.
     * - `failure` with `Cancelled`: your `signal` or `dispose()` stopped it.
     * - Any other `failure`, such as a network error or a 5xx: the session is cleared anyway.
     * Repeated calls send one request.
     * `dispose()` clears the session, whether or not a logout is running. `sessionCleared` is then false.
     */
    logout: async (options?: RecipeOptions): Promise<LogoutResult> => {
      const result = await once(
        { key: 'logout', first: 'logout', options, onAbort: cancelled('logout', 'logout') },
        async (at, signal): Promise<LogoutResult> => {
          if (!axyl.session.isSignedIn()) {
            return {
              ...fail(
                'FailedPrecondition',
                'No player is signed in, so there is nothing to sign out of.',
                'validate',
              ),
              sessionCleared: false,
            }
          }
          // The `auth` module sends `change` with `logout` when it clears the session for this request.
          let sessionCleared = false
          const stop = axyl.session.on('change', ({ reason }) => {
            if (reason === 'logout') sessionCleared = true
          })
          try {
            const r = await axyl.auth.logoutPlayer(callOptions(signal))
            return r.kind === 'success'
              ? { kind: 'success', sessionCleared }
              : { ...toLoginResult(r, at.step), sessionCleared }
          } finally {
            stop()
          }
        },
      )
      // A result that `once` makes itself has no `sessionCleared`: `Aborted` while another call runs,
      // `Cancelled` for a `signal` that had already stopped, or a `Cancelled` or `Internal` that `thrown` makes from an error.
      // It cleared nothing.
      return { ...result, sessionCleared: result.sessionCleared === true }
    },
  }
}

/** Apple JS, the script Apple publishes for Sign in with Apple on the web. */
const APPLE_JS_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'
const APPLE_JS_ID = 'hiveaxyl-appleid-auth'
/** The Apple scopes that Apple JS requests when `scope` is not set. */
const APPLE_DEFAULT_SCOPE = 'name email'

/**
 * Starts to load Apple JS, which Apple sign-in uses when `createLogin` has no `appleRelayUri`.
 * Call it when the sign-in screen opens. A click before Apple JS has loaded ends as `Auth_AppleJsNotLoaded`.
 * It adds one `<script>` tag. If the script fails to load, it removes the tag, so a later call tries again.
 * It does nothing when Apple JS is ready, when the tag is already there, or when the page has no `document`.
 * Allow `https://appleid.cdn-apple.com` in the `script-src` of your Content Security Policy.
 */
export function preloadAppleJs(): void {
  const doc = (globalThis as { document?: Document }).document
  if (doc === undefined || appleIdAuth() !== undefined || doc.getElementById(APPLE_JS_ID)) return
  const script = doc.createElement('script')
  script.id = APPLE_JS_ID
  script.src = APPLE_JS_SRC
  script.async = true
  script.onerror = () => script.remove()
  doc.head.appendChild(script)
}

/** The part of Apple JS that the recipe calls. */
interface AppleIdAuth {
  init(config: {
    readonly clientId: string
    readonly redirectURI: string
    readonly state: string
    readonly nonce: string
    readonly usePopup: boolean
  }): void
  signIn(config: { readonly scope: string }): unknown
}

/** `AppleID.auth` once Apple JS has loaded. */
function appleIdAuth(): AppleIdAuth | undefined {
  const auth = (globalThis as { AppleID?: { auth?: Partial<AppleIdAuth> } }).AppleID?.auth
  return typeof auth?.init === 'function' && typeof auth.signIn === 'function'
    ? (auth as AppleIdAuth)
    : undefined
}

/** Apple's code from Apple JS. It stays inside the recipe until the exchange. */
interface AppleCode {
  readonly kind: 'appleCode'
  /** Sensitive. Do not log or persist. */
  readonly code: string
}

/**
 * Ends the Apple JS sign-in that is still waiting, if any. Apple JS is one per page, so a newer sign-in
 * replaces an older one, even from another login flow. The older one then ends as `Cancelled` at once,
 * whether or not Apple JS ever answers it.
 */
let endWaitingAppleJs: (() => void) | undefined

/**
 * Opens Apple's sign-in window with Apple JS and waits for Apple's code.
 * `init` and `signIn` run before this function returns, so the browser still sees the click.
 * Each call uses a fresh `state`, checked against Apple's answer, and a fresh `nonce`.
 * Neither leaves this function, and neither does anything else Apple returns, except the code.
 */
function startAppleJs(p: OAuthProviderSignIn): Promise<AppleCode | Stopped> {
  const step = 'acquireCredential'
  const scope = p.scope === undefined ? APPLE_DEFAULT_SCOPE : p.scope
  const invalid = !isFilled(p.clientId)
    ? 'Apple JS sign-in needs your Apple Services ID as clientId.'
    : !isAppleJsPage(p.redirectUri)
      ? 'Apple JS sign-in needs an https: redirectUri on a domain name, without # or user info.'
      : !isOnThisPage(p.redirectUri)
        ? 'Apple JS sign-in needs redirectUri on the game page origin. Apple JS answers only to that origin.'
        : !isAppleScope(scope)
          ? 'Apple JS sign-in takes only name and email as scope.'
          : undefined
  if (invalid !== undefined) return Promise.resolve(fail('InvalidArgument', invalid, 'validate'))
  const apple = appleIdAuth()
  if (apple === undefined) {
    preloadAppleJs()
    return Promise.resolve(
      fail(
        'Unavailable',
        'Apple JS is not loaded yet. Try again in a moment.',
        step,
        'Auth_AppleJsNotLoaded',
      ),
    )
  }
  const state = randomHex()
  const nonce = randomHex()
  // Apple JS replaces the older request as soon as this one starts, so end the older one first.
  endWaitingAppleJs?.()
  let pending: unknown
  try {
    apple.init({
      clientId: p.clientId.trim(),
      redirectURI: p.redirectUri,
      state,
      nonce,
      usePopup: true,
    })
    // The scope goes with each request. Set in `init`, it would carry over to later requests.
    pending = apple.signIn({ scope: scope.trim() })
  } catch {
    return Promise.resolve(
      fail('Internal', 'Apple JS could not start the sign-in.', step, 'Auth_AppleJsStartFailed'),
    )
  }
  return new Promise((resolve) => {
    let done = false
    const end = (result: AppleCode | Stopped) => {
      if (done) return
      done = true
      if (endWaitingAppleJs === replaced) endWaitingAppleJs = undefined
      resolve(result)
    }
    const replaced = () => end(fail('Cancelled', 'A newer Apple sign-in replaced this one.', step))
    endWaitingAppleJs = replaced
    Promise.resolve(pending)
      .then(
        (r) => end(readAppleAnswer(r, state)),
        (e: unknown) => end(appleError(isRecord(e) ? e['error'] : undefined)),
      )
      // Reading an odd answer can throw, for example from a getter. End the call instead of leaving it waiting.
      .catch(() =>
        end(
          fail('Internal', "Apple's answer could not be read.", step, 'Auth_AppleResponseInvalid'),
        ),
      )
  })
}

/** `true` when `url` is on the origin of this page, or when there is no page to compare with. */
const isOnThisPage = (url: string): boolean => {
  const here: unknown = (globalThis as { location?: { origin?: unknown } }).location?.origin
  if (typeof here !== 'string' || here === 'null') return true
  try {
    return new URL(url).origin === here
  } catch {
    return false
  }
}

/**
 * Reads the answer of Apple JS `signIn`: `{ authorization: { code, id_token, state } }` or `{ error }`.
 * Apple's `state` must match the request. Apple's code and identity token must both be there.
 */
function readAppleAnswer(r: unknown, state: string): AppleCode | Stopped {
  const step = 'acquireCredential'
  if (isRecord(r) && r['error'] !== undefined) return appleError(r['error'])
  const auth = isRecord(r) ? r['authorization'] : undefined
  if (!isRecord(auth)) {
    return fail(
      'Internal',
      'Apple JS returned no authorization.',
      step,
      'Auth_AppleResponseInvalid',
    )
  }
  if (auth['state'] !== state) {
    return fail(
      'PermissionDenied',
      'The Apple answer does not belong to this sign-in.',
      step,
      'Auth_AppleStateMismatch',
    )
  }
  const code = auth['code']
  if (!isFilled(code) || !isFilled(auth['id_token'])) {
    return fail(
      'Internal',
      'Apple JS returned no code or no identity token.',
      step,
      'Auth_AppleResponseInvalid',
    )
  }
  return { kind: 'appleCode', code }
}

/**
 * The result for an `error` from Apple JS.
 * A closed or declined window is `user_canceled`, as for the other providers.
 * A blocked window is `WebAuthPopupBlocked`. Other errors keep Apple's code when it is a plain code.
 */
function appleError(error: unknown): Stopped {
  const step = 'acquireCredential'
  if (error === 'popup_closed_by_user' || error === 'user_cancelled_authorize') {
    return { kind: 'businessOutcome', code: 'user_canceled', step }
  }
  if (error === 'popup_blocked_by_browser') {
    return fail('Unavailable', 'The browser blocked the Apple window.', step, 'WebAuthPopupBlocked')
  }
  const code =
    typeof error === 'string' && /^[\w.-]{1,64}$/.test(error)
      ? error
      : 'Auth_AppleAuthorizationError'
  return fail('Unknown', 'Apple returned an error.', step, code)
}

/**
 * `true` for a page Apple accepts as a Return URL: an absolute `https:` URL on a domain name,
 * without a fragment or user info. Apple takes no loopback host and no IP address.
 */
const isAppleJsPage = (v: unknown): boolean => {
  if (!isFilled(v) || v.includes('#')) return false
  try {
    const url = new URL(v)
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      !isLoopbackHost(url.hostname) &&
      !url.hostname.startsWith('[') &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
    )
  } catch {
    return false
  }
}

/** `true` for an Apple scope: `name`, `email`, both, or none, separated by spaces. */
const isAppleScope = (v: unknown): v is string =>
  typeof v === 'string' &&
  v
    .split(' ')
    .filter((s) => s !== '')
    .every((s) => s === 'name' || s === 'email')

/** 32 random bytes as 64 lowercase hex characters. */
const randomHex = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** What `once` needs to run one recipe task. */
interface Task {
  /** Decides, with `secret`, whether a repeated call shares the running one. */
  readonly key: string
  /** The step the task starts at. */
  readonly first: LoginStep
  /** The caller's options. The task gets their `signal`. */
  readonly options: RecipeOptions | undefined
  /** Input kept out of the key: a password, a grant key or `guestToken`. */
  readonly secret?: string
  /**
   * The result when `signal` has already stopped. The task then does not start.
   * Defaults to `Cancelled` at `first`. `null` leaves `signal` to the task.
   */
  readonly onAbort?: Failure | null
}

/** The step a running recipe task has reached. */
interface Progress {
  step: LoginStep
}

/** A provider credential for the Hive Axyl server. It stays inside the recipe. */
interface Credential {
  readonly kind: 'credential'
  readonly providerId: ProviderId
  readonly providerUserId: string
  /** Sensitive. Do not log or persist. */
  readonly providerToken: string
}

/** A result other than `success`: where and why a recipe call stopped. */
type Stopped = Exclude<LoginResult, { kind: 'success' }>

/** The `failure` branch of `LoginResult`. */
type Failure = Extract<LoginResult, { kind: 'failure' }>

/**
 * How a provider sign-in reaches the provider and comes back to the game page.
 * - `steam`: Steam OpenID 2.0. Steam returns to the game page.
 * - `relay`: Apple. Apple returns to the Hive Axyl relay, which sends the player on to the game page. Apple takes no provider PKCE.
 * - `pkce`: Google and X. OAuth with the provider PKCE pair, which the code exchange needs.
 */
type Route =
  | { readonly via: 'steam'; readonly p: SteamProviderSignIn }
  | { readonly via: 'relay'; readonly p: OAuthProviderSignIn; readonly relay: string }
  | { readonly via: 'pkce'; readonly p: OAuthProviderSignIn; readonly pkce: Pkce }

/** The sign-in window could not open. `route` lets the page move to the provider with the same values. */
interface Blocked {
  readonly kind: 'blocked'
  readonly error: HiveError
  readonly route: Route
}

const fail = (
  code: HiveError['code'],
  message: string,
  step: LoginStep,
  externalCode?: string,
): Failure => ({
  kind: 'failure',
  error: externalCode === undefined ? { code, message } : { code, message, externalCode },
  step,
})

/** The `Cancelled` result of a call that its `signal` stopped. `what` names the call. */
const cancelled = (step: LoginStep, what: 'sign-in' | 'link' | 'logout' = 'sign-in'): Failure =>
  fail('Cancelled', `The ${what} was cancelled.`, step)

const isUsageError = (e: unknown) => e instanceof Error && e.name === 'AxylUsageError'

/** `true` for a string with a non-space character. A page without type checks can pass anything. */
const isFilled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/**
 * `true` for an absolute `https:` URL without a fragment, on a host that is not a loopback host.
 * Apple does not return to a loopback host, so the relay cannot be one.
 */
const isRelayUrl = (v: string): boolean => {
  try {
    const url = new URL(v)
    return url.protocol === 'https:' && !v.includes('#') && !isLoopbackHost(url.hostname)
  } catch {
    return false
  }
}

/**
 * `true` for a loopback host: `localhost`, `loopback` and their subdomains, `127.0.0.0/8`, and `::1`.
 * An IPv4-mapped IPv6 address in `127.0.0.0/8` also counts.
 * It takes `URL.hostname`, which is lowercase and writes IPv4 in dotted decimal.
 * It writes `[::ffff:127.0.0.1]` as `[::ffff:7f00:1]`.
 */
const isLoopbackHost = (host: string): boolean =>
  /^(?:.+\.)?(?:localhost|loopback)\.*$/.test(host) ||
  /^127\.\d+\.\d+\.\d+$/.test(host) ||
  host === '[::1]' ||
  /^\[::ffff:7f[\da-f]{2}:[\da-f]{1,4}\]$/.test(host)

/** Waits for `work`, but resolves with `undefined` as soon as `signal` stops. A later rejection of `work` is ignored. */
const unlessAborted = <T>(
  work: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T | undefined> => {
  if (signal === undefined) return work
  return new Promise((resolve, reject) => {
    const stop = () => resolve(undefined)
    if (signal.aborted) stop()
    else signal.addEventListener('abort', stop, { once: true })
    void work.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop))
  })
}

/**
 * The key that decides whether a repeated call shares the running one.
 * Only a call with every setting equal shares it. Any other call while one runs gets `Aborted`.
 */
function providerKey(p: ProviderSignIn): string {
  const oauth = p.provider === 'STEAM' ? [] : [p.authorizeEndpoint, p.clientId, p.scope ?? null]
  return JSON.stringify([p.provider, p.redirectUri, p.fallbackRedirectUri ?? null, ...oauth])
}

const callOptions = (signal: AbortSignal | undefined) => (signal ? { signal } : {})

/**
 * `true` when the page runs inside a frame, such as on a game portal.
 * It matches `inIframe` of the SDK's `detectEnvironment()`. The recipe keeps its own copy, so it imports only types.
 */
function inFrame(): boolean {
  try {
    return globalThis.self !== globalThis.top
  } catch {
    // Some sandboxed frames throw when `top` is read. Only a frame does that.
    return true
  }
}

/**
 * A sign-in window that gave no credential.
 * A window that could not open comes back as `blocked`, so the caller can move the page along `route` instead.
 * That happens when the browser blocked it, or the page runs in an in-app browser.
 */
function notSignedIn(
  r: Exclude<AxylResult<unknown, string>, { kind: 'success' }>,
  route: Route,
): Stopped | Blocked {
  return r.kind === 'failure' && r.error.externalCode === 'WebAuthPopupBlocked'
    ? { kind: 'blocked', error: r.error, route }
    : toLoginResult(r, 'acquireCredential')
}

/** The credential that a Steam callback carries. Steam needs no code exchange. */
function steamCredential(c: OpenIdCallback): Credential {
  return {
    kind: 'credential',
    providerId: 'STEAM',
    providerUserId: c.providerUserId,
    providerToken: c.providerToken,
  }
}

/**
 * The request that sends the player to the provider along `route` and back to `page`,
 * in the sign-in window or by moving the page.
 * For Apple, `state` starts with `page` and `|`, so the relay knows where to send the player.
 */
function providerRequest(
  route: Extract<Route, { via: 'steam' }>,
  page: string,
): SignInRequest<'steamOpenId'> & { readonly protocol: 'steamOpenId' }
function providerRequest(
  route: Exclude<Route, { via: 'steam' }>,
  page: string,
): SignInRequest<'oauth'>
function providerRequest(route: Route, page: string): SignInRequest
function providerRequest(route: Route, page: string): SignInRequest {
  if (route.via === 'steam') {
    return {
      protocol: 'steamOpenId',
      redirectUri: page,
      authorizationUrl: ({ returnTo }) => steamLoginUrl(returnTo),
    }
  }
  if (route.via === 'relay') {
    return {
      redirectUri: page,
      authorizationUrl: ({ state }) => oauthUrl(route.p, route.relay, `${page}|${state}`),
    }
  }
  return {
    redirectUri: page,
    authorizationUrl: ({ state }) => oauthUrl(route.p, page, state, route.pkce.challenge),
  }
}

/**
 * The OAuth 2.0 authorization request (RFC 6749, section 4.1.1), with PKCE (RFC 7636) when `codeChallenge` is set.
 * Apple posts its answer as a form, so its request adds `response_mode=form_post`.
 */
function oauthUrl(
  p: OAuthProviderSignIn,
  redirectUri: string,
  state: string,
  codeChallenge?: string,
): string {
  const params: [string, string][] = [
    ['response_type', 'code'],
    ['client_id', p.clientId],
    ['redirect_uri', redirectUri],
  ]
  const scope = p.scope?.trim()
  if (scope) params.push(['scope', scope])
  params.push(['state', state])
  if (p.provider === 'SIGNIN_APPLE') params.push(['response_mode', 'form_post'])
  if (codeChallenge !== undefined) {
    params.push(['code_challenge', codeChallenge], ['code_challenge_method', 'S256'])
  }
  const join = p.authorizeEndpoint.includes('?') ? '&' : '?'
  return `${p.authorizeEndpoint}${join}${toQuery(params)}`
}

/** Steam's OpenID 2.0 sign-in URL. The realm is the origin of `returnTo`, as Steam requires. */
function steamLoginUrl(returnTo: string): string {
  return `${STEAM_LOGIN}?${toQuery([
    ['openid.ns', OPENID_NS],
    ['openid.mode', 'checkid_setup'],
    ['openid.return_to', returnTo],
    ['openid.realm', new URL(returnTo).origin],
    ['openid.identity', OPENID_SELECT],
    ['openid.claimed_id', OPENID_SELECT],
  ])}`
}

/** A query string with every name and value percent-encoded. */
const toQuery = (params: readonly (readonly [string, string])[]): string =>
  params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')

function toLoginResult(
  r: Exclude<AxylResult<unknown, string>, { kind: 'success' }>,
  step: LoginStep,
): Stopped {
  return r.kind === 'failure'
    ? { kind: 'failure', error: r.error, step }
    : { kind: 'businessOutcome', code: r.code, step }
}
