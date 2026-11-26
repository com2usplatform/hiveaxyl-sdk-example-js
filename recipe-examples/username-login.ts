// Usage example: username sign-in and sign-up with the login recipe. It has no UI.
// `APP:` comments mark where your game must supply code, UI or a decision.
import { enterGameUnlessBlocked, type GameScreens, type Login } from './initialization'

/**
 * Signs in with the username and password the player typed.
 * When the username has no account yet, the recipe creates one.
 */
export async function signInWithUsername(
  login: Login,
  screens: GameScreens,
  username: string,
  password: string,
  grantKey?: string,
): Promise<void> {
  // APP: pass the password exactly as the player typed it. The SDK hashes it before sending.
  // Hashing it here as well would make every sign-in fail.
  // Never store or log the password.
  // APP: when your game server can issue grant keys, get a fresh one for every call and pass it here.
  // Sign-up then keeps working if the console starts to require keys. It lasts 60 seconds and works once.
  // Never store or log it.
  const r = await login.username(username, password, grantKey === undefined ? {} : { grantKey })
  switch (r.kind) {
    case 'success':
      // APP: `isNewAccount` is true when this call created the account.
      // Tell the player, because a mistyped username also creates a new account.
      // If the player expected an existing account, ask them to check the username.
      // This example tells the player and continues. Your game can ask the player to confirm first.
      if (r.isNewAccount) screens.showNotice('new_account_created')
      enterGameUnlessBlocked(screens, r)
      return
    case 'businessOutcome':
      // APP: `username_verify_failed` means the username exists and the password is wrong.
      // `grant_required_missing` or `invalid_grant_key` means a new account needs a fresh grant key.
      // Show a message for other codes. Log the ones you do not recognise with `r.step`.
      screens.showError(r.code)
      return
    case 'failure':
      // APP: `InvalidArgument` means the username or password is empty. Ask the player to fill it in.
      // Otherwise a network, server or browser problem. Offer a retry button.
      screens.showError(r.error.code)
      return
    default:
      // A future SDK version may add a result kind. Treat it as a failure you can retry.
      screens.showError('unknown')
  }
}
