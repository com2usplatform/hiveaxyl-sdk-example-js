// Usage example: link a provider to the signed-in player with the login recipe. It has no UI.
// `APP:` comments mark where your game must supply code, UI or a decision.
import type { ProviderSignIn } from '../recipes/login'
import type { GuestHolder } from './guest-login'
import type { GameAxyl, GameScreens } from './initialization'

/**
 * Wires a "Keep this account" button that links a provider to the signed-in player.
 * A guest credential lasts only until the tab closes, so linking is how a guest keeps the account.
 * After linking, the player signs in with `login.provider()` next time.
 * Call `login.linkProvider()` in the click handler before any `await`. Only synchronous checks may run before it.
 */
export function createLinkButton(
  { axyl, login }: GameAxyl,
  screens: GameScreens,
  p: ProviderSignIn,
  // APP: pass the same holder as the guest button, so this button can clear the credential.
  guest: GuestHolder,
) {
  return {
    async onClick(): Promise<void> {
      // Read the player ID before the call. A synchronous read keeps the click's permission to open the window.
      // The `provider_already_connected` and `provider_type_already_exists` results do not carry it.
      const linking = axyl.session.playerId()
      // APP: pass `{ signal }` from a Cancel button to stop waiting, as in `provider-login.ts`.
      const r = await login.linkProvider(p)
      switch (r.kind) {
        case 'success':
          // The first link makes this player's guest credential stop working.
          // Drop it only when it belongs to this player. Keep the credential of any other player.
          if (guest.current?.guestPlayerId === r.playerId) guest.current = null
          // APP: record `r.providerId` in your game. The recipe does not return the player's links.
          return
        case 'businessOutcome':
          // `user_canceled`: the player closed the window or declined. Show no error.
          // APP: inside a portal iframe, show the same hint as `provider-login.ts` does for this code.
          if (r.code === 'user_canceled') return
          // `provider_already_connected` and `provider_type_already_exists` both mean this player already has a link.
          // The guest credential of the player who was linking stopped working with that link, so drop it.
          // `provider_type_already_exists` also comes when a link that ended as `Cancelled` went through
          // and the retry used another account of the same provider.
          if (
            r.code === 'provider_already_connected' ||
            r.code === 'provider_type_already_exists'
          ) {
            if (linking !== null && guest.current?.guestPlayerId === linking) guest.current = null
          }
          // `provider_already_connected` means this account is already linked. Treat it as done.
          // APP: record the provider in your game.
          if (r.code === 'provider_already_connected') return
          // APP: `provider_owned_by_other` and `provider_type_already_exists` need the player's decision.
          // Explain the choice. Never switch accounts or unlink a provider automatically.
          // Show a message for other codes. Log the ones you do not recognise with `r.step`.
          screens.showError(r.code)
          return
        case 'failure':
          // APP: `FailedPrecondition` means no player is signed in, another sign-in window is still open,
          // or the session changed during the call (`Auth_SessionChanged`).
          // `Aborted` means the session changed while the provider window was open. Nothing was linked.
          // `Cancelled` does not undo a link the server already made.
          // A retry with the same account that ends as `provider_already_connected` means the earlier link went through.
          screens.showError(r.error.externalCode ?? r.error.code)
          return
        default:
          // A future SDK version may add a result kind.
          screens.showError('unknown')
      }
    },
  }
}
