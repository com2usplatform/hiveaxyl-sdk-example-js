# Recipe usage examples

UI-free TypeScript that shows the recipe calls. These are guides, not a runnable page.

A `// APP:` comment marks only a place where your game must supply code, UI or a decision. Other comments explain what the example already does.

## Reading order

1. [initialization.ts](initialization.ts): create the SDK and the login recipe once.
2. Pick the scenario below and read its [recipe](../recipes/README.md).

| Scenario       | Source                                 | Your game's work                                                                                                                                                                              |
| -------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start-up       | [initialization.ts](initialization.ts) | Show an error when the page cannot run the SDK; show the sign-in screen on a sign-out from `change`                                                                                           |
| Guest login    | [guest-login.ts](guest-login.ts)       | Keep the guest credential in `sessionStorage` for the tab; pass a grant key when new guests need one; check `isBlock` after a restore; show outcome messages                                  |
| Username login | [username-login.ts](username-login.ts) | Collect input; pass the password as typed; pass a grant key when new accounts need one; tell the player when `isNewAccount` is true; check `isBlock`                                          |
| Custom login   | [custom-login.ts](custom-login.ts)     | Authenticate with your game server and get a fresh one-time grant key; never retry with a used key; check `isBlock`                                                                           |
| Provider login | [provider-login.ts](provider-login.ts) | Set up each provider; call the recipe in the click handler before any `await`; finish a page-moving sign-in on load; check `isBlock`                                                          |
| Link provider  | [link-provider.ts](link-provider.ts)   | Ask the player to keep a guest account; let the player decide on conflicts; drop that player's guest credential after success, `provider_already_connected` or `provider_type_already_exists` |
| Logout         | [logout.ts](logout.ts)                 | Read `sessionCleared`, not `kind`; show the sign-in screen on a sign-out from `change`; show an error only while the player is still signed in                                                |
| PG purchase    | [purchase.ts](purchase.ts)             | Call `openPayment()` in the click handler before any `await`; have your game server verify the receipt and grant once; close after the grant; recover after sign-in                           |

For `businessOutcome`, handle the codes you know and log the rest. Do not parse human-readable messages to decide the result.
