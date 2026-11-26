// Usage example: custom sign-in with the login recipe. It has no UI.
// `APP:` comments mark where your game must supply code, UI or a decision.
import { enterGameUnlessBlocked, type GameScreens, type Login } from './initialization'

/** Asks your game server for a grant key. Your server authenticates the player first. */
export type FetchGrantKey = () => Promise<string>

/** Signs in with a one-time grant key from your game server. */
export async function signInWithCustom(
  login: Login,
  screens: GameScreens,
  fetchGrantKey: FetchGrantKey,
): Promise<void> {
  // APP: authenticate the player with YOUR game server and get its one-time grant key.
  // The key lasts 60 seconds and works once, so fetch a new one for every sign-in.
  // The game never makes the key and never holds server credentials. Never store or log the key.
  let grantKey: string
  try {
    grantKey = await fetchGrantKey()
  } catch {
    // APP: your game server did not issue a key, for example because it rejected the player.
    // The SDK was not called. Show your own message and let the player try again.
    screens.showError('grant_key_unavailable')
    return
  }
  const r = await login.custom(grantKey)
  switch (r.kind) {
    case 'success':
      enterGameUnlessBlocked(screens, r)
      return
    case 'businessOutcome':
      // APP: `invalid_grant_key` means the key expired, was used or is wrong. Get a fresh key from your server.
      // Show a message for other codes. Log the ones you do not recognise with `r.step`.
      screens.showError(r.code)
      return
    case 'failure':
      // APP: the server may already have used the key even though sign-in did not finish.
      // `r.step` `sessionSetup` means it was used for sure.
      // Never retry with the same key. Fetch a fresh key when the player tries again.
      screens.showError(r.error.code)
      return
    default:
      // A future SDK version may add a result kind. Treat it as a failure you can retry.
      screens.showError('unknown')
  }
}
