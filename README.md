# Hive Axyl JS SDK: Recipes and Examples

> **Official repository** of Com2uS Platform.
> Canonical URL: <https://github.com/com2usplatform/hiveaxyl-sdk-example-js>

|           |                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product   | Hive Axyl                                                                                                                                                                                                                |
| Domain    | sdk                                                                                                                                                                                                                      |
| Version   | see [`CHANGELOG.md`](CHANGELOG.md)                                                                                                                                                                                       |
| Lifecycle | Active                                                                                                                                                                                                                   |
| Related   | [hiveaxyl-sdk-js](https://github.com/com2usplatform/hiveaxyl-sdk-js): the SDK these recipes call. [hiveaxyl-sdk-example-unity](https://github.com/com2usplatform/hiveaxyl-sdk-example-unity): Unity recipes and examples |

Reference code for calling the Hive Axyl JS SDK in the right order. The SDK exposes each server API as one call and leaves the sequence to the game. A recipe is one worked answer to "what do I call, and in what order" for sign-in and PG purchases, and the usage example beside it shows the steps the game supplies.

| Folder                                          | Contents                                                                                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`INTEGRATION.md`](INTEGRATION.md)              | The integration guide: install, console setup, page requirements, the game server's work, a first integration step by step and a review checklist for code an AI agent wrote. |
| [`recipe-examples/`](recipe-examples/README.md) | UI-free usage guides for each recipe. The work your game supplies is marked with `// APP:`. Start here.                                                                       |
| [`recipes/`](recipes/README.md)                 | UI-free TypeScript that coordinates SDK calls and returns typed results. Copy the ones you need.                                                                              |
| [`callback/`](callback/)                        | The callback page for popup sign-in. Host it on your game origin and use its URL as `redirectUri`. It hands the URL to the game window and closes.                            |

Recipes are reference code to copy and adapt, not a library to depend on. There is no API compatibility promise: a recipe is correct for the SDK release it was verified against, the one pinned in [`package.json`](package.json), and may change with the next one.

Verified SDK version: `@com2usplatform/hiveaxyl` 1.0.1.

This repository has no runnable page. It is an npm project so that the recipes and usage examples type-check against the SDK version pinned in `package.json`.

## Requirements

Install the SDK in your game:

```sh
npm install @com2usplatform/hiveaxyl
```

A game without a build tool loads the `<script>` bundle instead. [Install](INTEGRATION.md#install) in the integration guide lists every way and how to pin a version. [Prepare the page](INTEGRATION.md#prepare-the-page) lists what the game page needs, such as HTTPS and the supported browsers.

To type-check this repository, run `npm install` and then `npm run typecheck`.

## Using a recipe in your game

1. Read [`recipe-examples/initialization.ts`](recipe-examples/initialization.ts) and the usage example for your scenario.
2. Copy [`recipes/login.ts`](recipes/login.ts) and, for payments, [`recipes/payment.ts`](recipes/payment.ts) into your game. [Using a recipe](recipes/README.md#using-a-recipe) lists the modules each recipe needs and how to load it without a build tool.
3. For provider sign-in, host the files in [`callback/`](callback/) on your game origin.

A copied recipe does not receive fixes. When a new release changes a recipe, apply that change to your copy yourself. [`CHANGELOG.md`](CHANGELOG.md) lists the changes.

## Rules for your game

Follow [Rules for your app](https://github.com/com2usplatform/hiveaxyl-sdk-js/blob/main/README.md#rules-for-your-app) in the SDK README. They hold on every browser. Like the Hive Axyl SDK for Unity, the SDK keeps tokens in memory and leaves the guest credential to your game. Browsers have no secure storage, so keep it only for the tab.

The recipes add two points:

- Keep guest credentials in `sessionStorage` under your game's own key. They survive a reload and go away when the tab is closed for good. Restore a guest only when the player presses "Play as guest", never on page load.
- A `guest()` result carries the guest credential. Log a recipe result's `step`, never the whole result.

## Support

GitHub Issues are not used as a support channel for this repository. Please use the channels below for questions, bug reports, feature requests and customer inquiries.

| Purpose                                  | Channel                                               |
| ---------------------------------------- | ----------------------------------------------------- |
| Questions, bug reports, feature requests | <cs-platform@com2us.com>                              |
| Security vulnerabilities                 | Private report only, see [`SECURITY.md`](SECURITY.md) |

GitHub is not an official customer support channel, and we do not commit to response or resolution timelines here. External pull requests are not accepted.

## License

Licensed under the Apache License, Version 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
