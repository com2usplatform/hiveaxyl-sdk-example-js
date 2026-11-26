# Integration Guide

This guide takes a browser (H5) game from an empty page to sign-in, one API call, sign-out and a PG purchase with the Hive Axyl JS SDK. It ends with a checklist for an integration that an AI coding agent wrote.

The [SDK README](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md) is the full reference. This guide links to it instead of repeating it.

## Contents

1. [Install](#install)
2. [Prepare the console](#prepare-the-console)
3. [Prepare the page](#prepare-the-page)
4. [What your game server does](#what-your-game-server-does)
5. [What the browser keeps](#what-the-browser-keeps)
6. [First integration, step by step](#first-integration-step-by-step)
7. [Handle failures](#handle-failures)
8. [Review checklist](#review-checklist)

## Install

The official package is `@com2usplatform/hiveaxyl`. It is the only supported package. Packages with similar names are not from this project. Do not install them.

| Way               | When to use it                   | How                                                                         |
| ----------------- | -------------------------------- | --------------------------------------------------------------------------- |
| npm               | The game has a build tool        | `npm install @com2usplatform/hiveaxyl`                                      |
| `<script>` bundle | The game has no build tool       | Load the bundle from jsDelivr, pinned with SRI (below)                      |
| Release asset     | The npm registry is out of reach | Download the `.tgz` from the GitHub release. Run `npm install ./<file>.tgz` |

Do not install from a Git URL. A Git install has no `dist/` folder, so the package does not work.

With npm, import `createAxyl` from `@com2usplatform/hiveaxyl` and each module from its own path, such as `@com2usplatform/hiveaxyl/auth`. ES modules and CommonJS both work. Type declarations are included.

The bundle is `dist/hiveaxyl-sdk.iife.js` in the npm package. It defines the global `HiveAxylSDK`, which holds `createAxyl` and every module. Load it from the jsDelivr npm path with `integrity` and `crossorigin="anonymous"`:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@com2usplatform/hiveaxyl@VERSION/dist/hiveaxyl-sdk.iife.js"
  integrity="sha384-HASH_OF_THAT_VERSION"
  crossorigin="anonymous"
></script>
```

- Replace `VERSION` with an exact version such as `1.0.1`. Never use a range or `latest`.
- Use the `/npm/` path only. A `/gh/` path serves the Git repository, which has no `dist/` folder.
- Compute `integrity` for the exact version you pin. Take the file from the npm package, not from the CDN:

```sh
openssl dgst -sha384 -binary node_modules/@com2usplatform/hiveaxyl/dist/hiveaxyl-sdk.iife.js | openssl base64 -A
```

## Prepare the console

Set these up in the Hive Axyl console before you write code.

| What                 | Where it goes                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| App ID and Client ID | In Project Settings > App ID, select New App ID and set Runtime Environment to Web. Pass both values to `createAxyl`           |
| Provider sign-in     | Enter each provider's settings, such as the client secret, in the console. The game never holds them                           |
| PG products          | Register the PG products and the PG settings on the App ID that the game passes to `createAxyl`. `listProducts()` returns them |

Each provider also needs its own setup:

| Provider | What you set up at the provider                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google   | A "Web application" OAuth client. Register the redirect URIs below. Request `openid`                                                                                                                                                                         |
| X        | An OAuth 2.0 app of the Web App type, a confidential client with a client secret. Enter the secret in the console. Register the redirect URIs below. Request `users.read tweet.read`                                                                         |
| Steam    | A Steamworks Publisher Web API Key in the console. See [Steam Web API Key](#steam-web-api-key). Steam needs no redirect URI registration                                                                                                                     |
| Apple    | A Services ID with Sign in with Apple. Add the game domain and register the `https:` `redirectUri` as its Return URL. Request `name email`. In the console, enter the Services ID and the Sign in with Apple private key (`.p8`) with its Key ID and Team ID |

Register two redirect URIs with Google and X, character for character:

- The callback page, for example `https://game.example.com/callback.html`. Pass it to the recipe as `redirectUri`.
- The game page, for example `https://game.example.com/play`. Pass it to the recipe as `fallbackRedirectUri`. The recipe returns there when it moves the whole page.

Keep both URLs the same across builds and releases. Do not put a build or version ID in their paths. The provider rejects a redirect URI it does not know, so register a new URL before you use it.

Apple signs in with Apple JS by default. Apple JS opens Apple's window and hands the answer back to the game page.

- Add the game domain to the Services ID's domains.
- Register `redirectUri`, such as the callback page `https://game.example.com/callback.html`, as a Return URL of the Services ID. Apple takes only `https:` pages on a domain name. The recipe sends the same `redirectUri` with the code exchange.
- Allow `https://appleid.cdn-apple.com` in `script-src`, and call `preloadAppleJs()` from the login recipe when the sign-in screen opens.
- Keep `redirectUri` on the game page origin. Apple JS never moves the page, so a redirect button for Apple needs the relay below.
- Apple rejects loopback addresses such as `127.0.0.1` or `localhost`. Test Apple sign-in on a deployed `https:` page.

The Hive Axyl relay is optional. Apple returns only to an `https:` address registered with it, and it posts the answer as a form. With the relay, Apple returns to `/auth/v1/provider/callback` on the Hive Axyl server, such as `https://core-api.hiveaxyl.com/auth/v1/provider/callback`.

- Add the relay's domain to the Services ID's domains, and register the relay as its Return URL.
- Pass the same relay as `appleRelayUri` to `createLogin`. You host nothing for it.
- Register the callback page and the game page for your app in the Hive Axyl console, so the relay can send the player there.

### Steam Web API Key

The Hive Axyl server checks each Steam sign-in with Steam's Web API. It calls Steam with the key in the console.

- Use a Steamworks Publisher Web API Key. Steam rejects a user Web API Key from the Steam Community registration page. The sign-in then ends with `businessOutcome` `provider_request_failed`.
- Only a Steamworks partner account can create a Publisher Web API Key. A Steamworks administrator creates it.
- In Steamworks, open Users & Permissions > Manage Groups. Select or create a group, then select Create WebAPI Key.
- Select the General permission. Steam puts every call outside microtransactions, sales data and economy under it.
- Do not limit the key to IP addresses. The Hive Axyl server's addresses are not published, so a limited key fails every Steam sign-in.
- Treat the key as a secret. Enter it only in the console. Never put it in the game.

Steam needs no redirect URI registration. After a popup sign-in, Steam returns to `redirectUri`. After a sign-in that moves the whole page, Steam returns to `fallbackRedirectUri`.

Use the address each page loads at without a redirect, character for character. OpenID 2.0 requires the arrival address to match `openid.return_to`. If your host redirects it, for example by removing `.html` or adding a trailing `/`, Steam sign-in fails with `WebAuthCallbackURLParseFailed`, while Google and X still work.

## Prepare the page

| Requirement             | What to do                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secure context          | Serve the game over HTTPS. `localhost` also works. On other pages `createAxyl` returns a `failure` with `FailedPrecondition` and `externalCode` `Env_InsecureContext`                                                                                                                                                                                    |
| Content Security Policy | Allow the Hive Axyl API hosts in `connect-src`, as listed under [Page security](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#page-security). Add the sandbox payment host only while you test payments. For Apple sign-in with Apple JS, allow `https://appleid.cdn-apple.com` in `script-src`                                |
| Opener policy           | Set the game page's `Cross-Origin-Opener-Policy` to `same-origin-allow-popups` or weaker. A stricter value cuts the link to sign-in windows. A page that needs cross-origin isolation follows [When the link to the window is cut](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#when-the-link-to-the-window-is-cut)           |
| Portal iframe           | Give the portal operator the `<iframe>` tag under [Page security](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#page-security). Its `sandbox` needs `allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox`. The portal page's `Cross-Origin-Opener-Policy` must be `same-origin-allow-popups` or weaker |
| Callback page           | Host [`callback/`](callback/) (`callback.html`, `callback.js` and `callback.css`) on the game origin. Its URL is the `redirectUri`. Take it from the public repository. It is not in the npm package                                                                                                                                                     |
| Browser                 | See [Browser support](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#browser-support) and [In-app browsers](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#in-app-browsers-and-iframes). The SDK shows no message. Your game asks the player to open a regular browser                                 |
| Everything else         | Follow [Page security](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#page-security) for script order and portal iframes. Do not let a service worker handle requests to the Hive Axyl hosts                                                                                                                                    |

The callback page loads its script and its style sheet from files, so `script-src 'self'` and `style-src 'self'` allow them.

With a build tool, put the three callback files in the folder it serves and copies as they are, such as `public/` in Vite or Next.js. They then load at the origin root, and the callback page is `/callback.html`. With the Vite dev server, fix the port with `server.port` and `server.strictPort: true`. Otherwise Vite moves to the next free port when the port is in use, and the provider rejects the redirect URI. [Callback page](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#callback-page) in the README says what it does.

The sign-in answer reaches the callback page in the query string. After a redirect sign-in, it reaches the game page the same way. Keep it out of the access logs of your web server and CDN. Leave both paths out of the logs, or do not log their query strings.

## What your game server does

Any player can read and change browser code and memory, so some work must run on a server.

| Task              | Why it needs a server                                                                                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grant a purchase  | The SDK never confirms a payment. Your server verifies `purchase.axylReceipt` with the Hive Axyl server, grants the items once per transaction and then lets the game close the purchase                                                                                                                        |
| Trust a player ID | Send `await axyl.session.getAccessToken()` to your server. Your server checks the token with the Hive Axyl server before it trusts the player                                                                                                                                                                   |
| Issue a grant key | Custom sign-in needs a one-time grant key. When your server can issue keys, pass a fresh one on every `username()` call and every new `guest()` too, so account creation keeps working if the console starts to require keys. Your server authenticates the player and gets the key with its server credentials |

- Never put a client secret in the game page. Provider secrets live in the console. Credentials for server APIs stay on your server.
- Receipt verification is a server API, but it does not take your server credentials. Call it with the access token of the player who paid. With server credentials it fails with `payment_resource_not_found`.
- Send the access token only to your own game server. Do not put it in URLs, logs or analytics. The SDK never gives out the refresh token.
- A game without payments and without its own server can skip this section.

## What the browser keeps

The SDK stores a device key and, during a redirect sign-in, the sign-in values in browser storage. [Browser storage](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#browser-storage) in the README lists the keys, how long they last and how to remove them. Tokens stay in memory. Your game keeps the guest credential in `sessionStorage`:

| Value                                | Where                                           | How long                                               |
| ------------------------------------ | ----------------------------------------------- | ------------------------------------------------------ |
| Access token and refresh token       | SDK memory only                                 | Until a reload, the tab closes or the player signs out |
| Guest credential (`GuestCredential`) | Your game's `sessionStorage`, under its own key | Until the tab is closed for good                       |

[Rules for your app](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#rules-for-your-app) in the README holds the full guest credential rules. For the integration:

- A reload or a new tab starts signed out. Show the sign-in screen again. In the same tab, the player's "Play as guest" press signs the saved guest back in. Do not call `restoreGuest()` on page load. [`guest-login.ts`](recipe-examples/guest-login.ts) shows the holder.
- Do not keep the guest credential in `localStorage`, IndexedDB, cookies, logs or analytics. It stays valid until the player links a first sign-in provider, so on a shared computer the next person would get the account. Where players share computers, offer a way to start over and to link an account.
- A guest who closes the tab loses the account, with its progress and purchases. To keep a guest account past the tab, let the player link Google, X, Steam or Apple with `linkProvider()`. The player then signs in with that provider next time.
- When the browser blocks `localStorage`, the SDK keeps `deviceKey` in memory and emits `storagefallback`. Nothing else changes. Add that listener right after `createAxyl`, before any `await`, or you miss the event. `axyl.session.isStoragePersistent()` tells you later.

## First integration, step by step

The recipes hold the call order. Copy [`recipes/login.ts`](recipes/login.ts) and, for payments, [`recipes/payment.ts`](recipes/payment.ts) into your game. Without a build tool, load them as the [recipe guide](recipes/README.md#using-a-recipe) says. The files in [`recipe-examples/`](recipe-examples/README.md) show each step with `// APP:` marks where your game takes over.

### 1. Create the client

```ts
import { createAxyl } from '@com2usplatform/hiveaxyl'
import { auth } from '@com2usplatform/hiveaxyl/auth'
import { coupon } from '@com2usplatform/hiveaxyl/coupon'
import { token } from '@com2usplatform/hiveaxyl/token'
import { createLogin } from './login'

// Call once at startup. Keep the returned objects in your game state, not on `window`.
export function setUpAxyl(appId: string, clientId: string) {
  const created = createAxyl({
    appId,
    clientId,
    modules: { auth: auth(), token: token(), coupon: coupon() },
  })
  if (created.kind === 'failure') {
    showError(created.error.code) // the page cannot run the SDK, for example without HTTPS
    return null
  }
  const axyl = created.client
  axyl.session.on('storagefallback', () => {
    // Browser storage is blocked. The device key lives in memory until a reload.
  })
  return { axyl, login: createLogin(axyl, { clientId }) }
}
```

This is a short sketch for this guide. It registers `coupon` for step 4. The usage example [`recipe-examples/initialization.ts`](recipe-examples/initialization.ts) is a fuller version, `initAxyl`. It takes your game's screens and adds the `change` listener from step 2. It shows where to pass `appleRelayUri` if you sign in with Apple through the relay. It registers no `coupon`.

### 2. Follow the session

```ts
if (!axyl.session.isSignedIn()) showSignIn()
axyl.session.on('change', ({ state, reason }) => {
  if (state === 'signedOut') showSignIn(reason)
})
```

Treat the player as signed out only when `change` says so. One `failure` does not end the session. The README's [Usage](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#usage) explains the event and when to start a follow-up call. Create one `createLogin` flow per client and share it. Two flows do not see each other's calls.

### 3. Sign in

| Sign-in                 | Recipe call                                                              | Example                                                  |
| ----------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Guest                   | `login.guest()` the first time, `login.restoreGuest()` for a saved guest | [`guest-login.ts`](recipe-examples/guest-login.ts)       |
| Username                | `login.username()`                                                       | [`username-login.ts`](recipe-examples/username-login.ts) |
| Your own server         | `login.custom()`                                                         | [`custom-login.ts`](recipe-examples/custom-login.ts)     |
| Google, X, Steam, Apple | `login.provider()`                                                       | [`provider-login.ts`](recipe-examples/provider-login.ts) |
| Keep a guest            | `login.linkProvider()`                                                   | [`link-provider.ts`](recipe-examples/link-provider.ts)   |

- Call `login.provider()` and `login.linkProvider()` in the click handler before any `await`. Only synchronous checks may run before them. Browsers open a window only while they handle a click.
- When the popup cannot open and you set `fallbackRedirectUri`, `provider()` returns `redirecting` and moves the whole page. If the browser does not let the page move, it returns `failure` with `Unavailable` and no `externalCode` instead. Inside an iframe it never moves the page and returns `WebAuthPopupBlocked`, because providers such as Google refuse to show their sign-in pages inside a frame.
- Call `login.completeProviderRedirect()` once when the game page loads, after you create the client and before any other recipe call. Call it before your router changes the address, or the sign-in is lost and the call returns `null`. It returns `null` on a normal visit. A `failure` with `Aborted` and `step` `validate` means another recipe call was running. Call it again when that call ends.
- Call `preloadAppleJs()` from the login recipe when the sign-in screen opens, if you offer Apple. A click before Apple JS has loaded returns `Unavailable` with `Auth_AppleJsNotLoaded`. Apple JS never moves the page, so a blocked Apple window returns `WebAuthPopupBlocked` even with `fallbackRedirectUri`.
- Load third-party scripts, such as analytics, only after `completeProviderRedirect()` removed the callback parameters from the address. With the Apple relay, Apple's code there works without a verifier, so no script that reads the address may see it.
- A provider page's own `Cross-Origin-Opener-Policy` can cut the link to the sign-in window, so the sign-in ends as `user_canceled` right after the window opened. The recipe moves the page only when the popup is blocked. So offer a redirect button that calls `axyl.auth.startRedirectSignIn()` ([README](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#when-the-link-to-the-window-is-cut)). [Redirect button](#redirect-button) below shows the values it passes. `login.completeProviderRedirect()` finishes it on the next page load. Do not show this button inside an iframe.
- The first successful `login.linkProvider()` makes that player's guest credential stop working. `restoreGuest()` then returns `invalid_guest_token`. Drop the credential when its `guestPlayerId` equals the result's `playerId`.
- On `provider_owned_by_other` or `provider_type_already_exists` from `linkProvider()`, let the player decide. Never switch accounts or unlink a provider automatically. `provider_type_already_exists` also means this player already has a link, so drop the guest credential as for `provider_already_connected` below.
- `provider_already_connected` from `linkProvider()` means this exact account is already linked. Treat it as done. The guest credential stopped working with that link too, but this result has no `playerId`. Read `axyl.session.playerId()` before the call, and drop the credential when its `guestPlayerId` equals that ID.
- Check `isBlock` on a sign-in result before gameplay starts. A new guest's `isBlock` is always `false`, because the creation response reports no restriction. Call `auth.getBlockStatus()` if you need it.
- A recipe's `businessOutcome` or `failure` says in `step` where it stopped. Log `step` with the code.
- For `username()` and `custom()`, follow [Username and custom sign-in](recipes/README.md#username-and-custom-sign-in). Both need care with grant keys, and `username()` can create an account.

Describe each provider once. The `clientId` here is the OAuth client ID from the provider, not the Hive Axyl client ID. [`provider-login.ts`](recipe-examples/provider-login.ts) shows X and Steam too.

```ts
import type { ProviderSignIn } from './login'

const google = {
  provider: 'GOOGLE',
  authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  clientId: 'YOUR_GOOGLE_WEB_CLIENT_ID', // from your Google "Web application" OAuth client
  scope: 'openid',
  redirectUri: 'https://game.example.com/callback.html',
  fallbackRedirectUri: 'https://game.example.com/play',
} satisfies ProviderSignIn

// On page load
const back = await login.completeProviderRedirect()
if (back !== null) handleSignIn(back)

// In the click handler
googleButton.onclick = async () => {
  const r = await login.provider(google) // before any await
  handleSignIn(r)
}
```

#### Redirect button

The redirect button builds the same request as the recipe. The URL builders `oauthUrl()` and `steamLoginUrl()` are in your copy of the login recipe. Export them from that copy, or copy them next to the button. The recipe itself does not export them.

- `provider` is `'GOOGLE'`, `'X'`, `'STEAM'` or `'SIGNIN_APPLE'`. `completeProviderRedirect()` finishes only these.
- `redirectUri` is the game page, the same URL as `fallbackRedirectUri`.
- Google and X need a fresh PKCE pair from `axyl.auth.newPkce()`. The URL carries its `challenge`, and `codeVerifier` carries its `verifier`.
- Steam uses the `steamOpenId` protocol and needs no verifier.
- Apple works only through the relay. The URL names the relay as its redirect URI, and its `state` is the game page, `|` and the SDK's `state`. Apple needs no verifier.

```ts
const page = 'https://game.example.com/play' // the fallbackRedirectUri
// `google` and `apple` are the provider objects you pass to `login.provider()`.
// `apple` is the relay setup, and `appleRelayUri` is the same value you pass to `createLogin`.
// Without it in `createLogin`, `completeProviderRedirect()` cannot finish an Apple redirect.

async function redirectToGoogle() {
  const pkce = await axyl.auth.newPkce()
  return axyl.auth.startRedirectSignIn({
    provider: 'GOOGLE',
    redirectUri: page,
    codeVerifier: pkce.verifier,
    authorizationUrl: ({ state }) => oauthUrl(google, page, state, pkce.challenge),
  })
}

const redirectToSteam = () =>
  axyl.auth.startRedirectSignIn({
    provider: 'STEAM',
    protocol: 'steamOpenId',
    redirectUri: page,
    authorizationUrl: ({ returnTo }) => steamLoginUrl(returnTo),
  })

const redirectToApple = () =>
  axyl.auth.startRedirectSignIn({
    provider: 'SIGNIN_APPLE',
    redirectUri: page,
    authorizationUrl: ({ state }) => oauthUrl(apple, appleRelayUri, `${page}|${state}`),
  })
```

Each call returns `undefined` once the page starts to move, or a `failure`. The Google call returns a promise of the same. `newPkce()` rejects when Web Crypto fails. Wrap only `await axyl.auth.newPkce()` in `try`/`catch`, not `startRedirectSignIn()` or the whole button. In the `catch`, rethrow `AxylUsageError`, which means a code error such as a call after `dispose()`. For any other error, show a message that asks the player to try again.

### 4. Call a module

```ts
const r = await axyl.coupon.redeemCoupon({ body: { couponCode } })
switch (r.kind) {
  case 'success':
    showReward(r.data.mailId)
    break
  case 'outcome': // the server declined, for example `coupon_already_used`
    showMessage(r.code)
    break
  case 'unknownOutcome': // a code this SDK version does not know
    showMessage('unknown')
    break
  case 'failure':
    showError(r.error.code)
    break
  default:
    showError('unknown')
}
```

### 5. Sign out

Call `login.logout()`. Its `sessionCleared` says whether that call signed the player out. It does not follow from `kind`: a failed request can still sign the player out. Switch screens on `session.on('change')`, and show an error only while `isSignedIn()` is still true. A refusal such as `guest_signout_blocked`, a call while no player is signed in (`FailedPrecondition`) and a call while another sign-in runs (`Aborted`) keep the session. `Auth_SessionChanged` (`FailedPrecondition`) means the sign-in state changed during the call, and this call did not clear it. See [`recipe-examples/logout.ts`](recipe-examples/logout.ts).

### 6. Sell an item

Register `payment()` next to `auth` and `token`. Use `payment({ sandbox: true })` while you test, and remove `sandbox` before release. Create the flow once with `createPayment(axyl)` from the payment recipe. The player must be signed in. A purchase belongs to the player who paid. A guest who loses the guest credential, for example by closing the tab, or by reloading while the browser blocks `sessionStorage`, cannot find that purchase again with `recoverPurchases()`. Suggest linking a sign-in provider before a guest pays. The [payment recipe guide](recipes/README.md#payment-recipe) explains what each result means, and [`recipe-examples/purchase.ts`](recipe-examples/purchase.ts) shows the flow.

1. `listProducts()` loads the products. Take the `price` and `currency` of a purchase from this list. Your game server checks them again.
2. The buy button calls `openPayment()` in its click handler before any `await`. Only synchronous checks may run before it. Payments have no page-moving fallback. When the browser blocks the window, ask the player to press the button again or to allow popups.
3. Send each returned `purchase` to your game server, together with `await axyl.session.getAccessToken()`. The server verifies the receipt and grants the items once. The console lists a purchase in its payment history only after this verification. If the sign-in state changed since you called `recoverPurchases()` or `openPayment()`, do not send it.
4. Call `closePurchase()` after each grant, with `{ receipt }` if the server returned a closing receipt. Skip it if the sign-in state changed while your game server verified the purchase.
5. Call `recoverPurchases()` after every sign-in and after each payment. After every `openPayment()` result that carries `purchase`, including `businessOutcome` and `failure`, after `notFound`, a `payment_resource_not_found` without `purchase`, after a `failure` at the `restore` step, and after a `Cancelled` at the `storePurchase` step, call it once more when the player next returns to the game. The window can look closed while the player is still paying in it.

Two answers mean "nothing open yet", not an error:

- `notFound` from `openPayment()`: offer a "check again" button that calls `recoverPurchases()`. The next return to the game looks again too (step 5).
- `businessOutcome` with `payment_resource_not_found` and no `purchase`: after a sign-in this is the usual answer. Show nothing, or treat it like `notFound` after a payment. With `purchase`, handle that purchase as in steps 3 and 5.

## Handle failures

Every SDK call returns `success`, `outcome`, `unknownOutcome` or `failure`. Recipes return `success`, `businessOutcome` or `failure`. `login.provider()` adds `redirecting`, and `openPayment()` adds `notFound`.

- Branch on `kind`, then on `code` or `error.code`. Never parse `message`. It is English text for developers.
- Some codes are not errors, such as `user_canceled` and a `payment_resource_not_found` without `purchase`.
- Log a recipe's `step` along with the fields that the README allows.
- `AxylUsageError` is thrown only when your code must change, for example for invalid options or a call after `dispose()`.
  An empty `idempotencyKey` throws it too. So does an `auth` method that takes a password when the request has no `body` or the password is not a string.
- An empty password ends as `failure` with `InvalidArgument`. Nothing is sent. Check the input before you call.
- Pass IDs as the strings the SDK returned. A number path value that is not a safe integer ends as `failure` with `InvalidArgument`.
- A call can wait for minutes when the network hangs, because each attempt has its own limit and retries follow.
  On a screen that waits for a call, pass `{ signal: AbortSignal.timeout(ms) }`. Chrome and Edge before 103, Firefox before 100 and Safari before 16 lack `AbortSignal.timeout`. There, abort an `AbortController` from `setTimeout`. See [How long a call can wait](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#how-long-a-call-can-wait).
- Many calls at once while the token refreshes can fill the refresh queue. The extra calls end as `failure` with `ResourceExhausted`.
  `ResourceExhausted` also covers an HTTP 429 that the SDK's retries did not clear and a `Retry-After` longer than the SDK waits.
  Do not send the calls again automatically. Let the player try again after a while, and start fewer calls at once, for example when the tab wakes up.
  For an API that accepts `idempotencyKey`, a call sent again without your own key is a new action.
- The README's [Rules for your app](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#rules-for-your-app) and [Failure codes](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/v1.0.1/README.md#failure-codes) say what else to do.

## Review checklist

Review every integration with this list, especially one an AI coding agent wrote. Agents that do not know this SDK tend to store the guest credential in `localStorage`, write their own sign-in order and guess outcome messages.

### Package and loading

- [ ] The package is `@com2usplatform/hiveaxyl`. No unofficial package is installed.
- [ ] A `<script>` bundle is pinned to an exact version with `integrity` and `crossorigin="anonymous"`.
- [ ] The SDK loads and `createAxyl` runs before third-party scripts.
- [ ] The client lives in a module or closure variable, not on `window`.
- [ ] The page is served over HTTPS, and `connect-src` lists the Hive Axyl hosts.
- [ ] A `createAxyl` failure shows an error. The game does not go on without a client.
- [ ] The game page's `Cross-Origin-Opener-Policy` is `same-origin-allow-popups` or weaker. A page that needs cross-origin isolation offers the redirect sign-in and checks payments with `recoverPurchases()` instead.
- [ ] A portal iframe with `sandbox` allows `allow-scripts`, `allow-same-origin`, `allow-popups` and `allow-popups-to-escape-sandbox`.
- [ ] Inside an iframe, a `WebAuthPopupBlocked` result asks the player to open the game outside the portal and shows the game's address. Other codes keep their own message.
- [ ] A `user_canceled` sign-in result returns to the sign-in screen without an error. A `user_canceled` link result keeps the current screen and session without an error. Inside an iframe, either screen may also show the game's address as a hint. A portal `sandbox` without `allow-same-origin` ends even a completed sign-in or link this way.
- [ ] Inside an iframe, the game shows no button that moves the page to a provider.
- [ ] No service worker handles requests to the Hive Axyl hosts.

### Tokens and storage

- [ ] No access token or refresh token is written to `localStorage`, `sessionStorage`, IndexedDB or cookies.
- [ ] The guest credential is written only to `sessionStorage`, under the game's own key, never to `localStorage`, IndexedDB or cookies. Linking a provider or starting over removes it.
- [ ] No token or whole result goes to `console`, logs, analytics or error reports.
- [ ] The access token goes only to your own game server.
- [ ] No client secret is anywhere in the game code.
- [ ] The game shows the sign-in screen after a reload. It does not try to restore a session from storage.

### Sign-in

- [ ] Sign-in uses the copied login recipe, not a hand-written call order. The one exception is a redirect button that calls `axyl.auth.startRedirectSignIn()` as [Redirect button](#redirect-button) shows: a PKCE verifier for Google and X, and for Apple through the relay, a `state` of the game page, `|` and the SDK's `state`.
- [ ] Third-party scripts load only after `login.completeProviderRedirect()` removed the callback parameters from the address.
- [ ] `login.provider()` and `login.linkProvider()` run in the click handler before any `await`. Only synchronous checks run before them.
- [ ] With Apple sign-in through Apple JS (no `appleRelayUri`), the sign-in screen calls `preloadAppleJs()` when it opens. The Services ID lists the game domain and `redirectUri` as a Return URL, and `script-src` allows `https://appleid.cdn-apple.com`. Through the relay, the Services ID lists the relay instead.
- [ ] `login.completeProviderRedirect()` runs on page load whenever sign-in can move the page, with `fallbackRedirectUri` or a redirect button. It runs again after `Aborted` with `step` `validate`.
- [ ] The callback page is hosted on the game origin, and both redirect URIs are registered with Google and X.
- [ ] For Steam, the console holds a Steamworks Publisher Web API Key without an IP limit.
- [ ] The callback page and the game page keep the same URLs across builds. No build or version ID is in their paths.
- [ ] `isBlock` is checked before gameplay starts.
- [ ] Passwords are passed as typed, not hashed by the game.
- [ ] Every `custom()` call, and every `guest()` or `username()` call that passes `grantKey`, gets a fresh grant key from the game server. A key is never reused.
- [ ] On `provider_owned_by_other` or `provider_type_already_exists` from `linkProvider()`, the player decides. The game never switches accounts or unlinks a provider by itself.
- [ ] The game shows the sign-in screen at start and when `session.on('change')` reports a sign-out. It enters the game from the sign-in result after the `isBlock` check, not from `change`.
- [ ] On a sign-out, the game clears the player's cached data and drops results of calls started for the previous player.

### Results

- [ ] Every result branches on `kind`, and every `switch` has a `default` branch.
- [ ] Messages are chosen by `code` or `error.code`, never by parsing `message`.
- [ ] Unknown outcome codes get a general message and are logged by code. A recipe result's `step` is logged with it.
- [ ] A failed query keeps the last data and offers a retry. With no earlier data, it shows an error with a retry, not an empty state.

### Payments

- [ ] `openPayment()` runs in the click handler before any `await`. Only synchronous checks run before it.
- [ ] The client never grants items. The game server verifies `axylReceipt` and grants once per transaction.
- [ ] The screen counts each purchase once. It redraws the balance from the game server and does not add the granted amount on the client.
- [ ] The game server verifies the receipt with the paying player's access token, not with server credentials.
- [ ] `closePurchase()` runs only after the server confirmed the grant.
- [ ] After a sign-in change since `recoverPurchases()` or `openPayment()`, the purchase is neither sent to the game server nor closed.
- [ ] `recoverPurchases()` runs after every sign-in and after each payment.
- [ ] After an `openPayment()` result that carries `purchase`, after `notFound`, a `payment_resource_not_found` without `purchase`, after a `failure` at the `restore` step, and after a `Cancelled` at the `storePurchase` step, `recoverPurchases()` runs once more when the player next returns to the game.
- [ ] `notFound` and a `payment_resource_not_found` without `purchase` offer a "check again" button or show nothing. They are not shown as errors.
- [ ] The release build registers `payment()` without `sandbox`, and its `connect-src` has no sandbox payment host.

### Lifecycle

- [ ] A development reload calls `dispose()` on the old client before it creates a new one.
- [ ] Code that calls `dispose()` owns the next screen. `dispose()` sends no `change` event.
- [ ] No SDK module call runs after `dispose()`. Such a call throws `AxylUsageError`. Check `axyl.isDisposed()` in code that can outlive the client.

### Test with an agent

Before a release, check that this guide and the package are enough:

1. Create an empty project with TypeScript, and another with a plain `<script>` page.
2. Install only the package. Let the agent learn from the package README, `llms.txt` and the public repository.
3. Ask an AI coding agent for a guest sign-in and a coupon screen.
4. Review the result with the checklist above.
