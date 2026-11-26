// Usage example: guest sign-in with the login recipe. It has no UI.
// `APP:` comments mark where your game must supply code, UI or a decision.
import type { GuestCredential, GuestLoginResult } from '../recipes/login'
import type { FetchGrantKey } from './custom-login'
import { enterGameUnlessBlocked, type GameScreens, type Login } from './initialization'

/** Holds the guest credential. Share one holder between the guest and link buttons. */
export interface GuestHolder {
  current: GuestCredential | null
}

/**
 * Keeps the guest credential in `sessionStorage` for this tab.
 * It survives a reload. After a reload, the player's "Play as guest" press signs the same guest back in
 * instead of creating a new one. Do not call `restoreGuest()` on page load.
 * It goes away when the tab is closed for good. A new tab starts without it.
 * A browser that reopens a closed tab or restores a session brings it back, and a duplicated tab copies it.
 * When `sessionStorage` is blocked, the credential lives in memory until a reload.
 *
 * Keep only the guest credential here. The SDK keeps tokens in memory, and the game never stores them.
 * Do not use `localStorage`, IndexedDB or cookies instead: the guest token stays valid until the player
 * links a first sign-in provider, so on a shared computer the next person would get the account.
 * Any script on any page of the game's origin in this tab can read `sessionStorage`.
 * Keep untrusted scripts off every page of that origin.
 */
export function createGuestHolder(): GuestHolder {
  // APP: use a key with your game's own prefix. The SDK's keys start with `hiveaxyl:`.
  const key = 'mygame:guest'
  let current = load(key)
  return {
    get current() {
      return current
    },
    set current(value) {
      current = value && { guestPlayerId: value.guestPlayerId, guestToken: value.guestToken }
      save(key, current)
    },
  }
}

/**
 * Wires a "Play as guest" button.
 * The first press creates a guest. Later presses in the same tab, also after a reload, sign the same guest back in.
 * Signing in stays a player action: the button restores the guest, not the page load.
 * APP: on a shared computer, the next person who reopens the tab gets this guest. Offer `startOver()`
 * and account linking where players share computers.
 * Pass `fetchGrantKey` when your game server can issue grant keys for new guests.
 */
export function createGuestButton(
  login: Login,
  screens: GameScreens,
  guest: GuestHolder,
  fetchGrantKey?: FetchGrantKey,
) {
  // A press while a new guest is being made would fetch a second key and create a second guest.
  let creating = false
  return {
    async onClick(): Promise<void> {
      if (guest.current === null) {
        // APP: show the button as busy while `creating` is true.
        if (creating) return
        creating = true
        try {
          await create()
        } finally {
          creating = false
        }
        return
      }
      const restored = await login.restoreGuest(guest.current)
      if (restored.kind !== 'success') {
        // The result does not repeat the credential. Keep the one you hold unless the code says it no longer works.
        report(restored)
        return
      }
      enterGameUnlessBlocked(screens, restored)
    },

    /**
     * Forgets the guest credential, so the next press creates a new guest.
     * A new guest is a different account. Call this only when the player chooses to start over.
     */
    startOver(): void {
      guest.current = null
    },
  }

  async function create(): Promise<void> {
    // APP: when your game server can issue grant keys, get a fresh one for every new guest.
    // Guest creation then keeps working if the console starts to require keys.
    // The key lasts 60 seconds and works once. Never store or log it. A restore needs no key.
    let grantKey: string | undefined
    if (fetchGrantKey) {
      try {
        grantKey = await fetchGrantKey()
      } catch {
        // APP: your game server did not issue a key. The SDK was not called. Let the player try again.
        screens.showError('grant_key_unavailable')
        return
      }
    }
    const created = await login.guest(grantKey === undefined ? {} : { grantKey })
    if (created.kind === 'success') {
      guest.current = created.guest
      // A new guest has `isBlock` false, because the creation response reports no restriction.
      // APP: to check for a restriction before gameplay starts, call `auth.getBlockStatus()` here.
      screens.showGame(created.playerId)
      return
    }
    // The guest account may already exist even though sign-in failed.
    // Keep it so the next press signs the same guest back in instead of creating another.
    if (created.guest) guest.current = created.guest
    report(created)
  }

  function report(r: Exclude<GuestLoginResult, { kind: 'success' }>): void {
    switch (r.kind) {
      case 'businessOutcome':
        // APP: show a message for `r.code`. Keep and log codes you do not recognise, with `r.step`;
        // do not parse the server's message text to decide the result.
        // Keep the guest credential you hold, and `r.guest` if it is set, so the player can retry.
        // APP: `grant_required_missing` or `invalid_grant_key` means a new guest needs a fresh grant key.
        // APP: `invalid_guest_token` means this credential can no longer sign in.
        // The account is not necessarily lost: linking another sign-in method to a guest
        // invalidates its credential, and the player can sign in with that method instead.
        // Offer that sign-in, and offer `startOver()` only as the player's own choice.
        screens.showError(r.code)
        return
      case 'failure':
        // APP: a network, server or browser problem. `Aborted` means another login or logout
        // is still running, or the session changed during sign-in. Offer a retry button.
        screens.showError(r.error.code)
        return
      default:
        // A future SDK version may add a result kind. Keep `guest` and offer a retry.
        screens.showError('unknown')
    }
  }
}

function load(key: string): GuestCredential | null {
  try {
    const saved: unknown = JSON.parse(globalThis.sessionStorage.getItem(key) ?? 'null')
    if (
      typeof saved === 'object' &&
      saved !== null &&
      'guestPlayerId' in saved &&
      'guestToken' in saved &&
      typeof saved.guestPlayerId === 'string' &&
      typeof saved.guestToken === 'string' &&
      saved.guestPlayerId !== '' &&
      saved.guestToken !== ''
    ) {
      return { guestPlayerId: saved.guestPlayerId, guestToken: saved.guestToken }
    }
  } catch {
    // Blocked storage or a damaged value. Start without a guest.
  }
  return null
}

function save(key: string, value: GuestCredential | null): void {
  try {
    if (value === null) globalThis.sessionStorage.removeItem(key)
    else globalThis.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Blocked or full storage. The holder still keeps the value in memory.
    // Remove an older guest, so a reload does not sign a different account back in.
    try {
      globalThis.sessionStorage.removeItem(key)
    } catch {
      // Storage is blocked. Nothing was saved.
    }
  }
}
