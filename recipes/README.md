# Recipes

Each recipe calls SDK modules in the order a flow needs and returns a typed result. Security work stays inside the SDK: PKCE values, password hashing, token exchange and session handling. A copied recipe does not receive SDK fixes, so it holds only the call order. Apple JS sign-in is the one exception: the login recipe makes the `state` and `nonce` values and checks Apple's answer. When a new release changes a recipe, apply that change to your copy yourself.

| Recipe       | Status    | Functions                                                                                                                       |
| ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `login.ts`   | Available | `guest()`, `restoreGuest()`, `username()`, `custom()`, `provider()`, `completeProviderRedirect()`, `linkProvider()`, `logout()` |
| `payment.ts` | Available | `listProducts()`, `openPayment()`, `recoverPurchases()`, `closePurchase()`                                                      |

No recipe unlinks a provider. Call `auth.unlinkProvider` directly. No recipe signs in with a stored access token, because the web SDK does not persist tokens.

## Using a recipe

- The login recipe needs the `auth` and `token` modules in `createAxyl`. The payment recipe needs the `payment` module and a signed-in player.
- A recipe returns `success`, `businessOutcome` (with the server's code as is) or `failure`. `openPayment()` adds `notFound`: the window closed and the server lists no open purchase of the product yet.
- A `businessOutcome` or `failure` carries `step`, the step where the call stopped, as the Hive Axyl SDK for Unity reports `FailedStep`. `logout()` adds `sessionCleared` to every result, like Unity's `SessionCleared`.
- Every recipe function takes `{ signal }`. A stopped call returns `failure` with `Cancelled`.
- `login.ts` and `payment.ts` import only types. On a page without a build tool, remove the type annotations and load them with `<script type="module">`. They keep their `export` keywords, so a classic `<script>` cannot load them. Import them from your own module script with a path that ends in `.js`, such as `./login.js`.
- To remove the type annotations, run the TypeScript compiler once in the folder that holds the two files. It writes `login.js` and `payment.js` to `js/`. `--ignoreConfig` keeps a `tsconfig.json` in a parent folder from stopping it:

  ```sh
  npx -p typescript@7 tsc login.ts payment.ts --target es2022 --module esnext --noCheck --ignoreConfig --outDir js
  ```

## Guest sign-in

- When your game server can issue a grant key, pass a fresh one as `grantKey` every time you create a guest with `guest()`. A console that requires keys refuses a guest without one, with `grant_required_missing`. `restoreGuest()` needs no key.
- Pass the grant key exactly as your game server got it. A key in the wrong format ends as `failure` with `InvalidArgument` (`externalCode` `invalid_parameter`), not as `invalid_grant_key`. The same holds for `username()` and `custom()`.

## Username and custom sign-in

- `username()` signs in first. When the server answers `username_verify_failed`, it creates the account, as the Hive Axyl SDK for Unity does. The sign-in gives that answer both for an unknown username and for a wrong password. If the sign-up then answers `username_already_exists`, the password was wrong, and the recipe returns the sign-in result. A mistyped username also creates a new account, so check `isNewAccount` and tell the player.
- When your game server can issue a grant key, pass a fresh one as `grantKey` on every `username()` call. Sign-up then keeps working if the console starts to require keys. The recipe sends it only with the sign-up request.
- `custom()` signs in with a grant key that your game server issued after it authenticated the player. The key lasts 60 seconds and works once. Get a fresh key for every call, and never retry with a key the server may have used.

## Provider sign-in

`provider()` and `linkProvider()` sign in with Google, X, Steam or Apple. Call them in a click handler before any `await`. Only synchronous checks may run before them. Browsers open a window only during the click.

| Provider | How the recipe signs in                                           | What your game sets up                                                                                                                             |
| -------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google   | OAuth popup with PKCE. The Hive Axyl server exchanges the code    | A web OAuth client. Register the callback page and the game page as redirect URIs. Request `openid`                                                |
| X        | OAuth popup with PKCE. The Hive Axyl server exchanges the code    | An OAuth 2.0 app of the Web App type, a confidential client with a client secret. Register the same redirect URIs. Request `users.read tweet.read` |
| Steam    | OpenID 2.0 popup. The Hive Axyl server verifies the signed answer | A Steamworks Publisher Web API Key in the console ([Steam Web API Key](../INTEGRATION.md#steam-web-api-key)). A user Web API Key does not work     |
| Apple    | Apple JS popup. The Hive Axyl server exchanges the code           | A Services ID. Register the game domain, and the `https:` `redirectUri` as its Return URL. Request `name email`                                    |

- Provider settings, such as the client secret, live in the Hive Axyl console ([setup](../INTEGRATION.md#prepare-the-console)). The game never holds a client secret.
- Host the [callback page](../callback/callback.html) (`callback.html`, `callback.js` and `callback.css`) on your game origin. Use its URL as `redirectUri`.
- Google, X and Steam return straight to a page on your game origin.
- Apple signs in with Apple JS by default, the script Apple publishes for the web. Apple JS opens Apple's window itself and hands the answer back to the page. It never moves the page.
  - Call `preloadAppleJs()` when the sign-in screen opens. A click before Apple JS has loaded returns `Unavailable` with `Auth_AppleJsNotLoaded`, and the recipe starts to load it.
  - In your Services ID, add the game domain and register `redirectUri` as a Return URL. It must be an `https:` page on a domain name. The recipe sends the same `redirectUri` with the code exchange.
  - `scope` defaults to `name email`. Apple JS takes only `name` and `email`. An empty scope asks for neither.
  - When the browser blocks Apple's window, the result is `WebAuthPopupBlocked`. `fallbackRedirectUri` does not apply.
  - Allow `https://appleid.cdn-apple.com` in the `script-src` of your Content Security Policy.
  - `redirectUri` must be on the game page origin. Apple JS answers only to that origin.
  - Apple JS never moves the page. `completeProviderRedirect()` can finish an Apple sign-in only when you pass `appleRelayUri`.
- The Hive Axyl relay is optional for Apple. Pass it as `appleRelayUri` to `createLogin` to use it: `/auth/v1/provider/callback` on the Hive Axyl server. Apple then returns to the relay, which sends the player on to `redirectUri`, or to `fallbackRedirectUri` after a page move. Register the relay, not the game pages, as the Return URL of the Services ID. You host nothing for the relay.
  - With the relay, `redirectUri` and `fallbackRedirectUri` must not contain `|`. The recipe returns `InvalidArgument` otherwise.
- Apple rejects loopback addresses such as `127.0.0.1` or `localhost`, so test Apple sign-in on a deployed `https:` page.
- When the browser blocks the popup or the page runs in an in-app browser, `provider()` moves the whole page to the provider if you set `fallbackRedirectUri`. If the browser does not let the page move, it returns `failure` with `Unavailable` and no `externalCode` instead. Call `completeProviderRedirect()` when the game page loads. Inside an iframe it never moves the page and returns `WebAuthPopupBlocked`: the move would load the provider inside the frame, where providers such as Google refuse to show.
- `linkProvider()` never moves the page. The session lives in memory, so a reload would sign the player out.

## Payment recipe

The payment recipe sells through a payment gateway (PG). It follows the PG order of the Hive Axyl SDK for Unity: products, pre-purchase record, payment URL, payment window, restore lookup, purchase record, game server verification, and close. This section says what the recipe does and what its results mean. [Step 6 of the integration guide](../INTEGRATION.md#6-sell-an-item) lists what your game does with each result.

- Call `openPayment()` in a click handler before any `await`. Only synchronous checks may run before it. It opens the payment window before its own first `await`.
- A closed window says nothing about the payment. `openPayment()` asks the server for open purchases after the window closes.
- The payment page usually opens in a tab, on phones and in most desktop browsers, and players often switch back to the game without closing it. So `openPayment()` also asks each time the game page becomes visible again while the window is open. A purchase of the product ends the call and leaves the window open until the player closes it or the client is disposed. In Chromium and WebKit browsers only the player can close it. Any other answer keeps it waiting. Pass `onReturn` to use your own signal, such as an "I have paid" button, or `null` to ask only after the window closes.
- A payment can finish after the window closed. `recoverPurchases()` finds it later.
- A `signal` or `dispose()` ends the call as `Cancelled`. In Chromium and WebKit browsers a window that already shows the payment page stays open. The next `openPayment()` then opens a second window. If the player pays in both, `recoverPurchases()` finds both purchases, and your game server grants each one.
- `purchase` can be an earlier open purchase of the same product, not the one paid in this window. A result also does not say whether the window is still open, and a payment there may finish later. A `failure` at the `restore` step says nothing about the payment either. [Step 6](../INTEGRATION.md#6-sell-an-item) of the integration guide says when to call `recoverPurchases()` after these results.
- `notFound` means the SDK saw the window as closed and the server has no open purchase of this product. A cut link to the window also looks closed, so `notFound` does not prove that the window closed. The player may have closed the window without paying, or the payment is still being processed.
- The SDK never confirms a payment. Your game server verifies `axylReceipt` with the paying player's access token and grants the items once per transaction. Then call `closePurchase()`, or the purchase keeps coming back from `recoverPurchases()`.
- When your game server returns a closing receipt with its grant, pass it as `closePurchase(purchase, { receipt })`. Without it, `closePurchase()` uses the purchase's own `axylReceipt`. A purchase with neither returns `InvalidArgument` and nothing is sent.
- With no open purchase, the server answers `businessOutcome` with the code `payment_resource_not_found`, as in the Unity SDK. Without `purchase`, there is nothing to recover. The purchase record can answer the same code. `openPayment()` then adds `purchase`: it found a payment but could not record it.
- A payment belongs to the player signed in when `openPayment()` starts. If the sign-in state changes meanwhile (a sign-in, even by the same player, a sign-out or the end of the session), the recipe sends no further request. It returns `failure` with `FailedPrecondition` and the `externalCode` `Auth_SessionChanged`. Call `recoverPurchases()` once the player who paid is signed in.
- The recipe does not close a window that already shows the payment page, because the player may be paying. It returns after the player closes that window. The exception is a purchase found while the window is open: the call no longer waits for the window. A sign-in change during the purchase record then returns at once with the window still open, and a new `openPayment()` is not blocked.
- `closePurchase()` goes out as the player signed in at that moment. A purchase that `recoverPurchases()` or `openPayment()` returned before a sign-in change belongs to the earlier player. Do not close it as the new player. That player's next `recoverPurchases()` returns it again. The usage example [purchase.ts](../recipe-examples/purchase.ts) watches `session.on('change')` for this.
- A call made while another payment runs returns `Aborted` with `Payment_InProgress`.
- A `closePurchase()` of a purchase that is still being closed returns `Aborted` with `Payment_CloseInProgress`. Use the result of the first call.
- `step` tells what already happened. After `restore` or `record`, the player may have paid. After `storePurchase`, only if the payment window opened. After `finalize`, the items were granted. A `notFound` result has no `step`.
- `accountUuid(namespace, playerId)` builds the purchase's `accountUuid` as a UUIDv5, the same value as `AccountUuid` in the Unity SDK. Choose the namespace once and never change it. It returns `null` when the player ID is not a plain decimal number or the page is not secure.
