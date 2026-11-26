# Security Policy

## Supported versions

The latest published version is supported. We do not ship separate security fixes for earlier versions. Fixes are delivered in the next published version.

## Reporting a vulnerability

**Do not report security issues through public GitHub issues, pull requests or discussions.** GitHub Issues are disabled in this repository, so the private channel below is the only intake path.

| Channel                      | Address                  |
| ---------------------------- | ------------------------ |
| Private vulnerability report | <cs-platform@com2us.com> |

Including the following helps us confirm a report quickly:

- The affected recipe, usage example or callback page, and the SDK version it was used with
- Browser name and version, and the operating system
- How the page is served: the origin, whether it uses HTTPS, and whether it runs in an iframe, an in-app browser or a webview
- The page's Content Security Policy, if it has one
- Reproduction steps and the minimum page needed to show the problem
- Expected impact, for example a token exposed to another script or a request sent to an unexpected host
- Any mitigation you are aware of

Do not include real access tokens, guest credentials, passwords or players' personal data in a report. Replace them with placeholders.

A vulnerability in the SDK itself can be reported through the same channel.

## What happens next

Reports are handled under Com2uS Platform's security incident response process. We acknowledge receipt and share progress through the intake channel you used. Nothing about a report appears in this repository until a fix is published.

We do not commit to response or resolution timelines.
