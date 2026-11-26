// Usage example: create the SDK and the login recipe at startup. It has no UI.
// `APP:` comments mark where your game must supply code, UI or a decision.
import { createAxyl, type SessionChangeReason } from '@com2usplatform/hiveaxyl'
import { auth } from '@com2usplatform/hiveaxyl/auth'
import { token } from '@com2usplatform/hiveaxyl/token'
import { createLogin, type SignedIn } from '../recipes/login'

/** The screens your game shows. The examples call these where the app takes over. */
export interface GameScreens {
  showSignIn(reason: SessionChangeReason | 'start'): void
  showGame(playerId: string): void
  /** Shows a localized message for a result or error code. Never show the SDK's `message` text to players. */
  showError(code: string): void
  /** Shows a localized message that is not an error, such as a new account notice. */
  showNotice(code: string): void
}

/**
 * Creates the SDK and the login recipe once, at startup.
 * Returns `null` when the page cannot run the SDK.
 */
export function initAxyl(appId: string, clientId: string, screens: GameScreens) {
  // Call this in browser code only. During server rendering, such as Next.js, `createAxyl` throws `AxylUsageError`.
  // Call it from a client component's effect or a module loaded with `ssr: false`.
  const created = createAxyl({ appId, clientId, modules: { auth: auth(), token: token() } })
  if (created.kind === 'failure') {
    // APP: the page is not served over HTTPS or localhost, or Web Crypto is missing.
    // Retrying does not help. Show an error screen. Log only the `kind` and `error.code`.
    // This failure happens before any request, so it has no `error.traceId`.
    console.warn(created.kind, created.error.code)
    screens.showError(created.error.code)
    return null
  }
  const axyl = created.client

  // This event reports every sign-out and session expiry, including ones the player did not start.
  // `reason` may gain new values, so treat unknown ones like any other sign-out.
  // Do not enter the game here on sign-in: the login result still has to be checked for `isBlock`.
  // The sign-in examples call `enterGameUnlessBlocked()` after that check.
  // Start a follow-up login from the recipe call's result. From this listener, defer it with `setTimeout`,
  // and expect `Aborted` while another recipe call, such as a provider sign-in, is still running.
  // APP: on `signedOut`, also clear the player's cached data, such as mail, links and balances,
  // and drop results of calls started for the previous player.
  axyl.session.on('change', ({ state, reason }) => {
    if (state === 'signedOut') screens.showSignIn(reason)
  })

  axyl.session.on('storagefallback', () => {
    // APP: browser storage is blocked, for example when the browser blocks site data or the page runs in a sandboxed iframe.
    // The device key now lives in memory and changes after a reload. Nothing else is affected.
  })

  // There is no automatic sign-in after a reload. Every visit starts signed out.
  screens.showSignIn('start')

  // Apple sign-in uses Apple JS when `createLogin` has no `appleRelayUri`.
  // APP: to sign in with Apple through the Hive Axyl relay instead, pass the relay on the Hive Axyl server
  // that this SDK build calls, such as `appleRelayUri: 'https://core-api.hiveaxyl.com/auth/v1/provider/callback'`.
  return { axyl, login: createLogin(axyl, { clientId }) }
}

export type GameAxyl = NonNullable<ReturnType<typeof initAxyl>>
export type Login = GameAxyl['login']

/**
 * Enters the game after a successful sign-in, unless `isBlock` says the player is restricted.
 * The sign-in examples call it with every `success` that carries `isBlock`, except a newly created guest.
 */
export function enterGameUnlessBlocked(screens: GameScreens, signedIn: SignedIn): void {
  // APP: `isBlock` is true when the player is restricted. Stop before gameplay starts.
  // The session stays signed in. Call `auth.getBlockStatus()` for the reason.
  // Call `logout()` if the player should not stay signed in.
  if (signedIn.isBlock) {
    screens.showError('blocked')
    return
  }
  screens.showGame(signedIn.playerId)
}
