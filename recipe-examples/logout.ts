// Usage example: sign-out with the login recipe. It has no UI.
// `APP:` comments mark where your game must supply code, UI or a decision.
import type { GameAxyl, GameScreens } from './initialization'

/**
 * Signs the player out.
 * The session ends when the server confirms the sign-out.
 * It also ends when the request failed, such as a network error or a 5xx.
 * The player asked to sign out, and an unanswered request does not take that back.
 * `sessionCleared` says whether this call ended the session. It does not follow from `kind`.
 * It does not say whether a session exists now: the session can also end for another reason meanwhile.
 * When this call clears the session, the session `change` event fires before the call returns.
 * The listener in `initialization.ts` then shows the sign-in screen.
 */
export async function signOut({ axyl, login }: GameAxyl, screens: GameScreens): Promise<void> {
  const r = await login.logout()
  if (r.sessionCleared) {
    // The `change` event has already shown the sign-in screen. Do not show an error on top of it,
    // even when `kind` is `failure`: the request failed, but the player is signed out.
    // Signing out ends the session only. Keep any guest credential the game holds:
    // it belongs to a guest account, not to the session that ended.
    // APP: if the player linked another sign-in method to that guest, the credential no longer works.
    // Restoring it returns `invalid_guest_token`. Offer the linked sign-in method instead.
    return
  }
  switch (r.kind) {
    case 'success':
      // The server signed the player out, but the session on this page had already changed or ended,
      // for example because another sign-in finished first. A session that is there now stays.
      return
    case 'businessOutcome':
      // APP: the server refused the sign-out, and the session stays.
      // `guest_signout_blocked` means a guest-only account cannot sign out.
      // Suggest linking an account first, because signing out would lose this guest.
      screens.showError(r.code)
      return
    case 'failure':
      if (r.error.code === 'Cancelled') {
        // The app called `dispose()`. The client is shut down and its session is cleared.
        // `dispose()` sends no `change` event, so the code that called it owns the next screen.
        return
      }
      // The session can still have ended for another reason, such as a rejected token refresh.
      // The `change` event has then shown the sign-in screen. Do not show an error on top of it.
      if (!axyl.session.isSignedIn()) return
      // APP: the player is still signed in. `Aborted` means a sign-in was still running, so no request was sent.
      // Otherwise the request failed. Offer a retry. A second logout() while one runs shares its result instead.
      screens.showError(r.error.code)
      return
    default:
      // A future SDK version may add a result kind. Offer a retry only while the player is still signed in.
      if (axyl.session.isSignedIn()) screens.showError('unknown')
  }
}
