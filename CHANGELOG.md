# Changelog

Changes to the recipes and the examples that call them are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

An entry earns its place here by its effect on games that copied a recipe. A change with no effect on the recipes or on the behavior they ship does not belong here.

## [1.0.1] - 2026-11-26

First release. There is no earlier version to compare against, so this entry says what the release contains. Each recipe's behavior is documented next to it, in [`recipes/README.md`](recipes/README.md) and in the usage example that calls it.

Verified against `@com2usplatform/hiveaxyl` 1.0.1.

### Added

- The login recipe `recipes/login.ts`, created with `createLogin()`: guest sign-in and restore, username, custom sign-in with a grant key from your game server, provider sign-in with Google, X, Steam and Apple, provider linking, and logout.
- The payment recipe `recipes/payment.ts`, created with `createPayment()`: product list, PG purchase through the payment window, recovery of purchases that were not closed, and closing a purchase after your game server granted the items.
- [`recipe-examples/`](recipe-examples/README.md): one short, UI-free usage example per scenario. Each place where your game supplies code, UI or a decision is marked `// APP:`.
- [`callback/`](callback/): the callback page for popup sign-in. Host it on your game origin and use its URL as `redirectUri`.
- [`INTEGRATION.md`](INTEGRATION.md): the integration guide, from an empty page to sign-in, one API call, sign-out and a PG purchase, with a review checklist for code an AI agent wrote.

Recipes are reference code to copy and adapt, not a library to depend on. There is no API compatibility promise: a recipe is correct for the SDK release it was verified against and may change with the next one.
