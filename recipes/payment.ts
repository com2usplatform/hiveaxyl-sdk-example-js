// Payment recipe for web checkout through a payment gateway (PG). Copy this source into your game. It is not part of the npm package.
// It holds only the call order. The SDK opens the payment window and sends the requests.
// The SDK never confirms that a payment succeeded. Your game server verifies the receipt and grants the items.
// This file imports only types. Remove the type annotations and load it with `<script type="module">` on a page without a build tool.
import type { AxylClient, AxylResult, HiveError } from '@com2usplatform/hiveaxyl'
import type {
  PaymentModule,
  Product,
  RestoredPurchase,
  RestorePurchasesRequest,
} from '@com2usplatform/hiveaxyl/payment'

type PaymentClient = Pick<
  AxylClient<{ payment: PaymentModule }>,
  'payment' | 'session' | 'isDisposed'
>

/**
 * Result of a recipe call. It has three branches:
 * - `success`: the call finished. Extra fields depend on the call. It never means the payment is confirmed.
 * - `businessOutcome`: the server answered with a business result code, including codes this SDK does not know yet.
 *   `code` is the server's code as is. Branch on `code`, not on the outcome's `data`.
 * - `failure`: a network, server or browser problem.
 *   `Cancelled` means your `signal` or `dispose()` ended the call.
 *   A call started after `dispose()` rejects with `AxylUsageError` instead, like an SDK module method.
 *   `Aborted` with the `externalCode` `Payment_InProgress` means another `openPayment()` is still running. Nothing was sent.
 *   `Aborted` with the `externalCode` `Payment_CloseInProgress` means a `closePurchase()` of the same purchase is still running.
 *   Nothing was sent. Use the result of that call.
 *   `FailedPrecondition` with the `externalCode` `Auth_SessionChanged` means the sign-in state changed during the call.
 *   The recipe then sends no further request. See `openPayment()`.
 *
 * `businessOutcome` and `failure` say in `step` where the call stopped.
 *
 * Module calls have four branches. The recipe merges `outcome` and `unknownOutcome` into `businessOutcome`.
 * Show a message for each `code`. Keep and log codes you do not recognise.
 * Log only `kind`, `step`, `code`, `error.code`, `error.externalCode` and a failure's `error.traceId`. Never log the whole result.
 */
export type PaymentResult<T = object> =
  | ({ readonly kind: 'success' } & T)
  | { readonly kind: 'businessOutcome'; readonly code: string; readonly step: PaymentStep }
  | { readonly kind: 'failure'; readonly error: HiveError; readonly step: PaymentStep }

/**
 * The step where a recipe call stopped, as the Hive Axyl SDK for Unity reports it.
 * - `validate`: the recipe checked the input, another payment was running, or the same purchase was being closed. Nothing was sent.
 * - `products`: the product list request.
 * - `prePurchase`: the pre-purchase record. Nothing was paid.
 * - `storePurchase`: the payment URL request or the payment window. The player may have paid only if the window opened.
 * - `restore`: the lookup of open purchases. The player may have paid.
 * - `record`: the purchase record after the lookup. The purchase was found and is still not granted.
 * - `finalize`: the close request. The items were already granted. Do not grant them again.
 * New steps may be added. Handle unknown ones in a default branch.
 */
export type PaymentStep =
  'validate' | 'products' | 'prePurchase' | 'storePurchase' | 'restore' | 'record' | 'finalize'

/** Options for one recipe call. */
export interface PaymentCallOptions {
  /**
   * Cancels the call. A cancelled call returns `failure` with the code `Cancelled`.
   * The payment window has no time limit of its own. Pass `AbortSignal.timeout(ms)` to set one.
   * Safari before 16 lacks `AbortSignal.timeout`. There, abort an `AbortController` from `setTimeout`.
   * Cancelling closes the payment window. In Chromium and WebKit browsers, such as Chrome and Safari, it stays open once it has moved to the payment page. The player can still pay there.
   * A player who already paid keeps the purchase. `recoverPurchases()` finds it.
   * Once the call has returned, the signal no longer closes the window.
   */
  readonly signal?: AbortSignal
}

/**
 * Calls `check` each time the player comes back to the game while the payment window is still open.
 * Returns a function that stops the calls. Neither the watch nor the stop function should throw.
 * If the watch throws or returns no function, the recipe looks only after the window closes.
 * A call of `check` while the watch is being set up, or after the payment ended, does nothing.
 */
export type ReturnWatch = (check: () => void) => () => void

/** Options for `openPayment()`. */
export interface OpenPaymentOptions extends PaymentCallOptions {
  /**
   * When to look for the purchase while the payment window is still open.
   * The payment page usually opens in a tab, on phones and in most desktop browsers. Players often switch back to the game and leave that tab open.
   * Each call of `check` asks the server once. A call made while a lookup runs, or after the sign-in state changed, is ignored.
   * A lookup that finds no purchase of this product keeps the payment waiting.
   * Defaults to `pageReturn`: each time this page becomes visible again.
   * Pass your own watch to add a signal, such as an "I have paid" button. Pass `null` to look only after the window closes.
   */
  readonly onReturn?: ReturnWatch | null
}

/**
 * The default `onReturn` watch. It calls `check` when this page becomes visible after it was hidden,
 * such as when the player switches back from the payment tab or from a payment app.
 * Combine it with your own signal when you pass `onReturn`.
 *
 * @example
 * const onReturn: ReturnWatch = (check) => {
 *   const stop = pageReturn(check)
 *   paidButton.onclick = check
 *   return () => {
 *     stop()
 *     paidButton.onclick = null
 *   }
 * }
 */
export const pageReturn: ReturnWatch = (check) => {
  const doc = globalThis.document
  if (doc === undefined) return () => {}
  let hidden = doc.visibilityState === 'hidden'
  const onChange = () => {
    if (doc.visibilityState === 'hidden') hidden = true
    else if (hidden) {
      hidden = false
      check()
    }
  }
  doc.addEventListener('visibilitychange', onChange)
  return () => doc.removeEventListener('visibilitychange', onChange)
}

/** The player's store region. Use the same values for every call of one purchase. */
export interface PaymentRegion {
  /** Country code, as two-letter ISO 3166-1. */
  readonly country: string
  /** Language code, as two-letter ISO 639-1. */
  readonly language: string
  /** Game server ID, when the game has several. */
  readonly serverId?: string
  /** App version to record with the purchase. */
  readonly appVersion?: string
}

/** Query for `listProducts()`. */
export interface ProductQuery extends PaymentRegion {
  /** Currency code, as three-letter ISO 4217. Prices use the tier prices of this currency. */
  readonly currency: string
  /** Product type to filter by. */
  readonly productType?: string
}

/**
 * What the player chose to buy. Take the product, price and currency from `listProducts()`.
 * Your game server checks them again. The client values are never the authority.
 */
export interface PurchaseOrder extends PaymentRegion {
  /** Product ID. */
  readonly productId: string
  /** The price the player was shown. */
  readonly price: number
  /** The currency of that price. */
  readonly currency: string
  /** Quantity, from 1 to 999. Defaults to 1. */
  readonly quantity?: number
  /**
   * JSON string that the payment server passes to your game server unchanged.
   * The recipe does not check that it is JSON. Build it with `JSON.stringify`.
   */
  readonly iapPayload?: string
  /**
   * UUIDv5 built from the `playerId` as a decimal string, with a namespace your game chooses and never changes.
   * Make it with `accountUuid()` in this recipe. The SDK does not add it.
   */
  readonly accountUuid?: string
}

/**
 * A paid purchase whose items were not granted yet.
 * Send it to your game server with `await axyl.session.getAccessToken()`.
 * The server verifies `axylReceipt` with that token and grants the items once per transaction.
 * Then call `closePurchase()` with it.
 * It is not proof of payment. Do not grant items on the client because you hold it.
 * `axylReceipt` is for your game server only. Do not log it.
 */
export type Purchase = RestoredPurchase & { readonly axylReceipt: string }

/**
 * Result of `openPayment()`.
 * - `success`: the server lists an open purchase of this product. The purchase is recorded.
 *   The recipe asked after the window closed, or when the player came back to the game while it was open (`onReturn`).
 *   In the second case the window stays open. The player may still be paying there. The recipe no longer watches it.
 *   `dispose()` still closes it, except in Chromium and WebKit browsers, where only the player can close it.
 *   It does not confirm the payment. Send `purchase` to your game server, which verifies `axylReceipt`.
 *   Then call `closePurchase()`.
 *   `purchase` can be an earlier open purchase of the same product, not the one paid in this window.
 *   Call `recoverPurchases()` after handling the result.
 * - `notFound`: the window closed and the server listed open purchases, but none of this product.
 *   A lookup while the window is open never ends the payment with `notFound`. The recipe keeps waiting instead.
 *   The player may have closed the window without paying.
 *   The payment can also still be in progress, because a window can look closed early.
 *   Offer a "check again" button that calls `recoverPurchases()`.
 * - `businessOutcome` with the code `payment_resource_not_found` and no `purchase`: the server has no open purchase at all.
 *   Treat it like `notFound`.
 * - `businessOutcome` or `failure` that carries `purchase`: the payment was found. Its items are still not granted.
 *   It has one of three causes:
 *   - Recording failed. The code can be `payment_resource_not_found` here too.
 *     The window stays as it was: closed, or still open after an early find.
 *   - Your `signal` or `dispose()` ended the call while it was being recorded. It may or may not be recorded.
 *     The recipe closes the window if it is still open. Chromium and WebKit keep a window that shows the payment page.
 *   - The client was disposed after it was recorded. The recipe closes the window the same way.
 *
 *   Send `purchase` to your game server, or find it later with `recoverPurchases()`.
 * - `failure` with the code `Unavailable` and the `externalCode` `WebAuthPopupBlocked`: the browser blocked the window.
 *   Ask the player to retry from a click, or to allow popups. Payments have no redirect fallback.
 * - `failure` with the code `Unavailable` and no `externalCode` at the `storePurchase` step: the payment page did not open,
 *   for example because the browser did not let the window move to it. Nothing was paid in it. Ask the player to retry from a click.
 * - `failure` with the code `FailedPrecondition` and the `externalCode` `Auth_SessionChanged`:
 *   the sign-in state changed during the payment. See `openPayment()`.
 * - Any other `businessOutcome` or `failure`: see `PaymentResult`.
 *
 * The result does not say whether the window is still open, and a payment there may finish later.
 * So after every result that carries `purchase`, call `recoverPurchases()` again when the player next returns to the game.
 * Do the same after a `failure` at the `restore` step. A failed lookup says nothing about the payment.
 * Do the same after a `Cancelled` at the `storePurchase` step. In Chromium and WebKit browsers the cancelled window can stay open, and the player can still pay there.
 * Do the same after `notFound` and a `payment_resource_not_found` without `purchase`. The window can look closed while the player is still paying.
 */
export type OpenPaymentResult =
  | { readonly kind: 'success'; readonly purchase: Purchase }
  | { readonly kind: 'notFound' }
  | (Exclude<PaymentResult, { kind: 'success' }> & { readonly purchase?: Purchase })

/** Options for `closePurchase()`. */
export interface ClosePurchaseOptions extends PaymentCallOptions {
  /**
   * The closing receipt your game server returned after it verified and granted the purchase, if it returned one.
   * Without it, the recipe closes with the purchase's own `axylReceipt`.
   */
  readonly receipt?: string | undefined
}

/** Data of a successful `closePurchase()`. It only closes the transaction. It does not confirm the payment. */
export interface ClosedPurchase {
  /** PG order number, starting with `H`. */
  readonly orderId: string | undefined
  /** The transaction number. */
  readonly storeTransactionId: string | undefined
}

/** The client OS of a PG order. Web games always send `WEBGL`. */
const PG_OS = 'WEBGL'
/** The store of every call in this recipe. */
const PG = 'PG'
/** The quantity range of one PG order. */
const MIN_QUANTITY = 1
const MAX_QUANTITY = 999

/**
 * Creates the PG payment flow for one SDK client.
 * The client must register the `payment` module, and the player must be signed in.
 * The flow follows the Hive Axyl SDK for Unity: products, pre-purchase record, payment URL,
 * payment window, restore lookup, purchase record, game server verification, and close.
 *
 * @example
 * const shop = createPayment(axyl)
 * buyButton.onclick = async () => {
 *   const r = await shop.openPayment(order) // before any await
 *   if (r.kind !== 'success') return showResult(r)
 *   const delivery = await gameServer.verifyAndGrant(r.purchase)
 *   if (delivery?.granted === true) await shop.closePurchase(r.purchase, { receipt: delivery.receipt })
 * }
 */
export function createPayment(axyl: PaymentClient) {
  // A player can press buy buttons in quick succession. Only one payment window runs at a time.
  let busy = false
  // Receipts whose close is in progress. A second close of the same receipt would send a second finalize request.
  const closing = new Set<string>()

  /**
   * Runs one payment in the window that `openPayment()` opened, then cleans up.
   * The stages are: prepare the payment page, wait for the purchase, and record it.
   */
  async function pay(
    win: PaymentWindow,
    order: PurchaseOrder,
    options: OpenPaymentOptions,
  ): Promise<OpenPaymentResult> {
    // The caller's signal asks the window to close until this call returns. Chromium and WebKit keep a window that shows the payment page.
    // That includes the purchase record after an early find.
    const closeOnAbort = () => win.close()
    let run: PaymentRun | undefined
    let shown = false
    try {
      run = {
        order,
        region: { country: order.country, language: order.language },
        call: callOptions(options.signal),
        player: watchPlayer(axyl),
      }
      options.signal?.addEventListener('abort', closeOnAbort, { once: true })
      const ready = await prepare(run)
      if (ready.kind !== 'ready') return ready
      // A step's last check and the next request ran in one turn before the steps were split. Check again here.
      const beforeWindow = run.player.interrupted(OK, PLAYER_CHANGED_BEFORE_WINDOW, 'storePurchase')
      if (beforeWindow) return beforeWindow
      const found = await waitForPurchase(run, win, ready.payUrl, options.onReturn, () => {
        shown = true
      })
      if (found.kind !== 'found') return found
      const beforeRecord = run.player.interrupted(OK, PLAYER_CHANGED_AFTER_WINDOW, 'restore')
      if (beforeRecord) return beforeRecord
      return await record(run, found.purchase)
    } finally {
      options.signal?.removeEventListener('abort', closeOnAbort)
      run?.player.stop()
      // Closes the window if a step failed before it was shown.
      // A shown window has closed, or stays open for the player after an early find. `dispose()` asks it to close.
      if (!shown) win.close()
      busy = false
    }
  }

  /**
   * Records the attempt and gets the payment page URL.
   * Returns the URL as `ready`, or the result that ends the payment before the page opens.
   */
  async function prepare({ order, region, call, player }: PaymentRun): Promise<Ready | Stopped> {
    // Record the attempt first. The payment page runs outside the game,
    // so this record is the only trace the purchase leaves before the window takes over.
    const pre = await axyl.payment.createPrePurchase(
      {
        body: {
          ...region,
          providerId: PG,
          productId: order.productId,
          price: order.price,
          currency: order.currency,
          requestDate: new Date().toISOString(),
          ...present({
            serverId: order.serverId,
            iapPayload: order.iapPayload,
            accountUuid: order.accountUuid,
          }),
        },
      },
      call,
    )
    let halt = player.interrupted(pre, PLAYER_CHANGED_BEFORE_WINDOW, 'prePurchase')
    if (halt) return halt
    if (pre.kind !== 'success') return toPaymentResult(pre, 'prePurchase')

    const url = await axyl.payment.createPaymentUrl(
      {
        body: {
          ...region,
          providerId: PG,
          os: PG_OS,
          productId: order.productId,
          quantity: order.quantity ?? 1,
          ...present({
            serverId: order.serverId,
            iapPayload: order.iapPayload,
            appVersion: order.appVersion,
          }),
        },
      },
      call,
    )
    halt = player.interrupted(url, PLAYER_CHANGED_BEFORE_WINDOW, 'storePurchase')
    if (halt) return halt
    if (url.kind !== 'success') return toPaymentResult(url, 'storePurchase')
    const payUrl: unknown = url.data?.payUrl
    if (typeof payUrl !== 'string' || !payUrl) {
      return fail(
        'Internal',
        'The server issued a PG order without a payment page URL.',
        'storePurchase',
      )
    }
    return { kind: 'ready', payUrl }
  }

  /**
   * Shows the payment page and waits for an open purchase of the product.
   * It asks the server after the window closes, and each time the player comes back to the game while it is open.
   * Returns the purchase as `found`, or the result that ends the payment.
   */
  async function waitForPurchase(
    { order, region, call, player }: PaymentRun,
    win: PaymentWindow,
    payUrl: string,
    onReturn: ReturnWatch | null | undefined,
    /** Called right before the window goes to the payment page. From then on the window is the player's to close. */
    onShow: () => void,
  ): Promise<OpenPaymentResult | Found> {
    // The payment server learns the result from the PG company, not from this page.
    // Ask it which paid purchases are still open.
    const restore = () =>
      axyl.payment
        .restorePurchases({ body: restoreBody({ ...order, ...region }) }, call)
        .then(checkedRestore)
    // The first open purchase of the product is taken, as in the Unity SDK example.
    const pick = (r: Restored) =>
      r.kind === 'success'
        ? purchasesOf(r.data?.restores).find((p) => p.productId === order.productId)
        : undefined

    // While the window is open, a return to the game asks the server once.
    // Only a purchase of this product ends the wait. Any other answer keeps waiting, because the player may still be paying.
    // Only one lookup runs at a time, and none goes out after a player change: it would go out as the new player.
    let checking: Promise<Restored | undefined> | undefined
    let foundEarly: (r: Restored) => void = () => {}
    const early = new Promise<Restored>((resolve) => (foundEarly = resolve))
    const watch = onReturn === undefined ? pageReturn : onReturn
    // A watch that calls `check` while it is set up or after it was stopped must not send a lookup.
    // The payment page is not shown yet, or the call is over.
    let watching = false
    const check = () => {
      if (!watching || checking !== undefined || player.changed || axyl.isDisposed()) return
      const lookup = restore().then(
        (r) => {
          if (!player.changed && pick(r) !== undefined) foundEarly(r)
          return r
        },
        () => undefined,
      )
      checking = lookup
      void lookup.finally(() => {
        if (checking === lookup) checking = undefined
      })
    }
    let stopWatch: (() => void) | undefined
    try {
      const stop: unknown = watch?.(check)
      if (typeof stop === 'function') stopWatch = stop as () => void
    } catch {
      // A failing watch in app code must not end the payment. The recipe still looks after the window closes.
    }
    watching = stopWatch !== undefined

    let first: { readonly shown: PaymentWindowResult } | { readonly restored: Restored }
    onShow()
    try {
      // The window reports only that it closed. A closed window says nothing about the payment.
      // A player change while it is open does not close it. The player may be paying.
      // The caller's signal asks the window to close through `openPayment()`. A waiting `show` then ends as `Cancelled`.
      first = await Promise.race([
        win.show(payUrl).then((shown) => ({ shown })),
        early.then((restored) => ({ restored })),
      ])
    } finally {
      watching = false
      try {
        stopWatch?.()
      } catch {
        // A failing stop in app code must not lose the result. `watching` already ignores later calls.
      }
    }

    let halt: Failed | undefined
    let restored: Restored
    if ('restored' in first) {
      restored = first.restored
    } else {
      const { shown } = first
      halt = player.interrupted(shown, PLAYER_CHANGED_AFTER_WINDOW, 'storePurchase')
      if (halt) return halt
      if (shown.kind !== 'closed')
        return { kind: 'failure', error: shown.error, step: 'storePurchase' }
      // Wait for a lookup that started while the window was open, so two never run at once.
      // It counts only if it found the purchase. Otherwise ask again now that the window has closed.
      const prior = await checking
      if (prior !== undefined && pick(prior) !== undefined) {
        restored = prior
      } else {
        // The sign-in state can change while the earlier lookup runs. A new lookup would go out as the new player.
        halt = player.interrupted(shown, PLAYER_CHANGED_AFTER_WINDOW, 'storePurchase')
        if (halt) return halt
        restored = await restore()
      }
    }
    halt = player.interrupted(restored, PLAYER_CHANGED_AFTER_WINDOW, 'restore')
    if (halt) return halt
    // A server with no open purchase answers `payment_resource_not_found`. It is returned as is, as in the Unity SDK.
    if (restored.kind !== 'success') return toPaymentResult(restored, 'restore')
    const purchase = pick(restored)
    if (!purchase) return { kind: 'notFound' }
    return { kind: 'found', purchase }
  }

  /** Records a found purchase. Every result after this point carries it, except a sign-in change. */
  async function record(
    { order, region, call, player }: PaymentRun,
    purchase: Purchase,
  ): Promise<OpenPaymentResult> {
    // Store the payment result before the game server verifies the receipt.
    // Values from the server win over the order, because they belong to the purchase that was paid.
    const recorded = await axyl.payment.recordStorePurchase(
      {
        body: {
          ...region,
          providerId: PG,
          axylReceipt: purchase.axylReceipt,
          productId: purchase.productId ?? order.productId,
          ...present({
            price: purchase.price ?? order.price,
            currency: purchase.currency ?? order.currency,
            orderId: purchase.orderId,
            storeTransactionId: purchase.storeTransactionId,
            iapPayload: purchase.iapPayload ?? order.iapPayload,
            serverId: order.serverId,
            accountUuid: order.accountUuid,
          }),
        },
      },
      call,
    )
    // The purchase belongs to the player who started the payment. Do not hand it to the game while another player is signed in.
    const halt = player.interrupted(recorded, PLAYER_CHANGED_AFTER_WINDOW, 'record')
    if (halt?.error.externalCode === SESSION_CHANGED) return halt
    // After `dispose()` no other player is signed in, so the purchase stays in the result and is not lost.
    if (halt) return { ...halt, purchase }
    if (recorded.kind !== 'success') return { ...toPaymentResult(recorded, 'record'), purchase }
    return { kind: 'success', purchase }
  }

  return {
    /** Gets the PG products with prices in the requested currency. */
    listProducts: async (
      query: ProductQuery,
      options: PaymentCallOptions = {},
    ): Promise<PaymentResult<{ readonly products: readonly Product[] }>> => {
      const r = await axyl.payment.fetchPgProducts(
        {
          body: {
            providerId: PG,
            country: query.country,
            language: query.language,
            currency: query.currency,
            ...present({
              productType: query.productType,
              serverId: query.serverId,
              appVersion: query.appVersion,
            }),
          },
        },
        options,
      )
      if (r.kind !== 'success') return toPaymentResult(r, 'products')
      return { kind: 'success', products: r.data?.products ?? [] }
    },

    /**
     * Runs one PG payment and reports what the server holds after the player is done with the payment page.
     * Call it in a click handler before any `await`. Only synchronous checks run before it.
     * It opens the payment window before its own first `await`. Browsers open a window only during the click.
     *
     * It sends a pre-purchase record and gets the payment URL, then moves the window there.
     * The window cuts `opener`, so the payment page cannot reach the game page.
     * When the window closes, it asks the server for paid purchases that are still open, and records the one it finds.
     * It also asks each time the player comes back to the game while the window is open (`onReturn`).
     * The payment page is usually a tab that players often leave open. A found purchase ends the call there.
     * It never grants items. Your game server verifies the receipt and grants them.
     *
     * Only one payment runs at a time. A call made meanwhile returns `failure` with the code `Aborted`
     * and the `externalCode` `Payment_InProgress`. It opens no window and sends no request.
     * An empty `productId`, a `quantity` outside 1 to 999, a `price` that is not a finite number of 0 or more,
     * or an empty `currency` returns `failure` with the code `InvalidArgument` in the same way.
     * So does an `order` that is not an object.
     *
     * The payment belongs to the player signed in when it starts.
     * The sign-in state can change meanwhile: a sign-in, a sign-out or the end of the session.
     * A sign-in by the same player counts too.
     * Then it sends no further request, because the request would go out as the new player.
     * It returns `failure` with the code `FailedPrecondition` and the `externalCode` `Auth_SessionChanged`.
     * - Before the payment page opens, it also closes the window. Nothing was paid.
     * - After the payment page opened, it leaves the window open, because the player may be paying.
     *   It returns after the player closes the window.
     *   Until then a new `openPayment()` returns `Payment_InProgress`, even for the player now signed in.
     *   Stop the old payment with its `signal` if you need to.
     * - After a purchase was found while the window is open, the call no longer waits for the window.
     *   A sign-in change during the purchase record returns `Auth_SessionChanged` at once, and the window stays open.
     *   A new `openPayment()` is then not blocked, as after any other result of an early find.
     * A payment made there belongs to the player who started it. Call `recoverPurchases()` once that player is signed in.
     */
    openPayment: (
      input: PurchaseOrder,
      options: OpenPaymentOptions = {},
    ): Promise<OpenPaymentResult> => {
      // Read the order once. Every step uses this copy, so a change to the app's object during the payment
      // cannot record one product and pay or look up another.
      const order = copyOrder(input)
      // After `dispose()` the recipe skips its own checks. `openPaymentWindow()` then throws the SDK's
      // `AxylUsageError` before it opens a window, and the call rejects with it, like the other recipe calls.
      if (!axyl.isDisposed()) {
        if (busy)
          return Promise.resolve(
            fail('Aborted', 'Another payment is in progress.', 'validate', 'Payment_InProgress'),
          )
        if (options.signal?.aborted) {
          return Promise.resolve(
            fail('Cancelled', 'The payment was cancelled before it started.', 'validate'),
          )
        }
        const invalid = invalidOrder(order)
        if (invalid !== undefined)
          return Promise.resolve(fail('InvalidArgument', invalid, 'validate'))
      }
      let win: PaymentWindow
      try {
        win = axyl.payment.openPaymentWindow()
      } catch (e) {
        return Promise.reject(e)
      }
      busy = true
      return pay(win, order, options)
    },

    /**
     * Finds paid purchases whose items were not granted yet.
     * Call it after every sign-in, after each payment, and when the player asks to check a payment again.
     * Send each purchase to your game server one at a time, then call `closePurchase()` for it.
     * An empty list is normal. A `failure` is not an empty list: retry later.
     * A server with no open purchase answers `businessOutcome` with the code `payment_resource_not_found`.
     * Treat that code as nothing to recover.
     * If the sign-in state changes before the answer arrives, it returns `failure` with the code `FailedPrecondition`
     * and the `externalCode` `Auth_SessionChanged`.
     * The list would belong to the previous player. Call it again for the player now signed in.
     */
    recoverPurchases: async (
      region: PaymentRegion,
      options: PaymentCallOptions = {},
    ): Promise<PaymentResult<{ readonly purchases: readonly Purchase[] }>> => {
      // After `dispose()` the lookup below rejects with the SDK's `AxylUsageError` before it sends anything.
      if (!axyl.isDisposed() && options.signal?.aborted) {
        return fail('Cancelled', 'The lookup was cancelled before it started.', 'validate')
      }
      const player = watchPlayer(axyl)
      try {
        const r = checkedRestore(
          await axyl.payment.restorePurchases({ body: restoreBody(region) }, options),
        )
        const halt = player.interrupted(
          r,
          'The sign-in state changed during the lookup. Look up again for the player now signed in.',
          'restore',
        )
        if (halt) return halt
        if (r.kind !== 'success') return toPaymentResult(r, 'restore')
        return { kind: 'success', purchases: purchasesOf(r.data?.restores) }
      } finally {
        player.stop()
      }
    },

    /**
     * Closes a purchase after your game server has verified the receipt and granted the items.
     * Always call it then. An open purchase keeps coming back from `recoverPurchases()`.
     * If it fails, leave the purchase open and do not grant the items again.
     * Do not save the purchase for a retry: `recoverPurchases()` returns it again.
     * A `success` only closes the transaction. It does not confirm the payment.
     * It goes out as the player signed in now. If the sign-in state changed since you called `recoverPurchases()` or `openPayment()`,
     * do not call it. Leave the purchase open for its player's next `recoverPurchases()`.
     * Pass `receipt` when your game server returned a closing receipt. The recipe then closes with it, as the Hive Axyl SDK for Unity does.
     * A purchase without a receipt returns `failure` with the code `InvalidArgument`. Nothing was sent.
     * A close of a purchase that is already being closed returns `failure` with the code `Aborted`
     * and the `externalCode` `Payment_CloseInProgress`. Nothing was sent. Use the result of the first call.
     * This holds until the first call returns, even after you cancel it. Call again only after it returned.
     */
    closePurchase: async (
      purchase: Pick<Purchase, 'axylReceipt'>,
      options: ClosePurchaseOptions = {},
    ): Promise<PaymentResult<ClosedPurchase>> => {
      // After `dispose()` the request below rejects with the SDK's `AxylUsageError` before it sends anything.
      // The recipe's own checks are skipped then, so the call rejects like an SDK module method.
      const alive = !axyl.isDisposed()
      if (alive && options.signal?.aborted) {
        return fail('Cancelled', 'The close was cancelled before it started.', 'validate')
      }
      const axylReceipt = isFilled(options.receipt) ? options.receipt : purchase?.axylReceipt
      if (alive && !isFilled(axylReceipt)) {
        return fail(
          'InvalidArgument',
          'Closing a purchase needs its receipt. Verify and grant it on your game server first. Nothing was sent.',
          'validate',
        )
      }
      // The purchase's own receipt and the receipt that closes it both name the purchase.
      // Hold both, so a close by either receipt is refused until the first call returns.
      const keys = [...new Set([purchase?.axylReceipt, axylReceipt].filter(isFilled))]
      if (alive && keys.some((key) => closing.has(key))) {
        return fail(
          'Aborted',
          'This purchase is already being closed. Use the result of that call.',
          'validate',
          'Payment_CloseInProgress',
        )
      }
      for (const key of keys) closing.add(key)
      try {
        const r = await axyl.payment.finalizePurchase(
          { body: { axylReceipt: axylReceipt ?? '', providerId: PG } },
          callOptions(options.signal),
        )
        if (r.kind !== 'success') return toPaymentResult(r, 'finalize')
        return {
          kind: 'success',
          orderId: r.data?.orderId,
          storeTransactionId: r.data?.storeTransactionId ?? undefined,
        }
      } finally {
        for (const key of keys) closing.delete(key)
      }
    },
  }
}

/** The same external code as the Hive Axyl SDK for Unity uses when a request outlives its login session. */
const SESSION_CHANGED = 'Auth_SessionChanged'
/** A step result that only asks whether the player changed or the client was disposed. */
const OK = { kind: 'success' } as const
const PLAYER_CHANGED_BEFORE_WINDOW =
  'The sign-in state changed before the payment page opened. Nothing was paid. Start the payment again.'
const PLAYER_CHANGED_AFTER_WINDOW =
  'The sign-in state changed during the payment. Sign in as the player who paid, then call recoverPurchases().'

type Failed = { readonly kind: 'failure'; readonly error: HiveError; readonly step: PaymentStep }
/** A result other than `success`: where and why a recipe call stopped. */
type Stopped = Exclude<PaymentResult, { kind: 'success' }>
type PaymentWindow = ReturnType<PaymentClient['payment']['openPaymentWindow']>
type PaymentWindowResult = Awaited<ReturnType<PaymentWindow['show']>>
type Restored = Awaited<ReturnType<PaymentClient['payment']['restorePurchases']>>

/** One running `openPayment()`. Its stages share these values. */
interface PaymentRun {
  readonly order: PurchaseOrder
  /** The region read when the payment started. Every request of the payment sends it. */
  readonly region: { readonly country: string; readonly language: string }
  /** The SDK call options of every request in the payment. */
  readonly call: { readonly signal?: AbortSignal }
  readonly player: PlayerWatch
}

/** The payment page URL that `prepare` got. */
interface Ready {
  readonly kind: 'ready'
  readonly payUrl: string
}

/** An open purchase of the ordered product, found by a lookup while the payment window is open or after it returns. */
interface Found {
  readonly kind: 'found'
  readonly purchase: Purchase
}

/** Watches the signed-in player while a recipe call runs. */
interface PlayerWatch {
  /**
   * Returns the failure that ends the call after a step, or `undefined` to go on.
   * Any `change` event since the watch started ends as `FailedPrecondition` with the `externalCode` `Auth_SessionChanged`
   * and `changedMessage`, even when the step was cancelled.
   * That covers a sign-in, a sign-out and the end of the session. A sign-in that keeps the same player ID still counts.
   * Otherwise a cancelled step returns `undefined`. The caller handles it like any other failed step, so it ends as `Cancelled`.
   * After `dispose()`, which sends no `change` event, it ends as `Cancelled` even when the step succeeded.
   * `at` is the step that just ran. The failure reports it.
   */
  interrupted(
    result: { readonly kind: string; readonly error?: HiveError },
    changedMessage: string,
    at: PaymentStep,
  ): Failed | undefined
  /** `true` once a `change` event came since the watch started. */
  readonly changed: boolean
  stop(): void
}

/**
 * Starts watching the signed-in player.
 * Each SDK request uses the session of the moment it is sent.
 * So a request after a player change would go out as the new player.
 */
function watchPlayer(axyl: PaymentClient): PlayerWatch {
  let changed = false
  const stop = axyl.session.on('change', () => {
    changed = true
  })
  return {
    interrupted(result, changedMessage, at) {
      // A sign-in change wins over a cancel. An app that stops the payment from a `change` listener still gets `Auth_SessionChanged`.
      if (changed) return fail('FailedPrecondition', changedMessage, at, SESSION_CHANGED)
      if (result.kind === 'failure' && result.error?.code === 'Cancelled') return undefined
      // `dispose()` sends no `change` event. It ends the call as `Cancelled`, like any SDK call.
      if (axyl.isDisposed()) {
        return fail('Cancelled', 'The client was disposed during the call.', at)
      }
      return undefined
    },
    get changed() {
      return changed
    },
    stop,
  }
}

/** The body of a lookup of open purchases in `region`. */
function restoreBody(region: PaymentRegion): RestorePurchasesRequest['body'] {
  return {
    providerId: PG,
    country: region.country,
    language: region.language,
    ...present({ serverId: region.serverId, appVersion: region.appVersion }),
  }
}

/**
 * Turns a lookup whose `restores` is not a list of objects into a `failure` (`Internal`).
 * A broken response is not an empty list, and reading it as a list would throw.
 */
function checkedRestore(r: Restored): Restored {
  if (r.kind !== 'success') return r
  const list: unknown = r.data?.restores
  if (list === undefined || list === null) return r
  if (Array.isArray(list) && list.every((p) => typeof p === 'object' && p !== null)) return r
  return {
    kind: 'failure',
    error: {
      code: 'Internal',
      message: 'The restore response has no usable purchase list.',
      // A failure decided after the response keeps that response's trace ID, so the server team can find it.
      ...(r.traceId !== undefined && { traceId: r.traceId }),
    },
  }
}

/** Open purchases that carry a receipt. A purchase without one cannot be verified or closed. */
function purchasesOf(entries: readonly RestoredPurchase[] | undefined): Purchase[] {
  return (entries ?? []).filter(
    (p): p is Purchase => typeof p.axylReceipt === 'string' && p.axylReceipt !== '',
  )
}

/**
 * A copy of the order fields that the recipe reads, taken once. It reads getters too, such as those of a class.
 * A value that is not an object stays as it is, so `invalidOrder()` reports it.
 */
function copyOrder(order: PurchaseOrder): PurchaseOrder {
  if (typeof order !== 'object' || order === null) return order
  const {
    productId,
    price,
    currency,
    quantity,
    iapPayload,
    accountUuid,
    country,
    language,
    serverId,
    appVersion,
  } = order
  return {
    productId,
    price,
    currency,
    country,
    language,
    ...present({ quantity, iapPayload, accountUuid, serverId, appVersion }),
  }
}

/**
 * Why the order cannot be sent, or `undefined` when it can.
 * Checked before the window opens: the server would reject it without naming the field.
 */
function invalidOrder(order: PurchaseOrder): string | undefined {
  // A page without type checks can pass `null`. It ends here as a result, like the other checks.
  if (typeof order !== 'object' || order === null) {
    return 'A purchase needs an order object. Nothing was sent.'
  }
  if (typeof order.productId !== 'string' || order.productId.trim() === '') {
    return 'A purchase needs a product ID. Nothing was sent.'
  }
  const quantity = order.quantity ?? MIN_QUANTITY
  if (!Number.isInteger(quantity) || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
    return `A PG order must contain between ${MIN_QUANTITY} and ${MAX_QUANTITY} items. Nothing was sent.`
  }
  // The pre-purchase record keeps the price the player saw. `NaN` and `Infinity` become `null` in JSON.
  if (typeof order.price !== 'number' || !Number.isFinite(order.price) || order.price < 0) {
    return 'A purchase needs the price the player saw, as a finite number of 0 or more. Nothing was sent.'
  }
  if (typeof order.currency !== 'string' || order.currency.trim() === '') {
    return 'A purchase needs the currency of its price. Nothing was sent.'
  }
  return undefined
}

/** Copies only the fields that have a value. The request types do not accept `undefined` or `null`. */
function present<T extends object>(
  fields: T,
): { [K in keyof T]?: Exclude<T[K], undefined | null> } {
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== null),
  ) as { [K in keyof T]?: Exclude<T[K], undefined | null> }
}

function fail(
  code: HiveError['code'],
  message: string,
  step: PaymentStep,
  externalCode?: string,
): Failed {
  return {
    kind: 'failure',
    error: { code, message, ...(externalCode !== undefined && { externalCode }) },
    step,
  }
}

function toPaymentResult(
  r: Exclude<AxylResult<unknown, string>, { kind: 'success' }>,
  step: PaymentStep,
): Stopped {
  return r.kind === 'failure'
    ? { kind: 'failure', error: r.error, step }
    : { kind: 'businessOutcome', code: r.code, step }
}

/** `true` for a string with a non-space character. A page without type checks can pass anything. */
const isFilled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/**
 * SDK call options with only `signal`, for recipe options that also hold recipe settings such as `onReturn` or `receipt`.
 * `listProducts()` and `recoverPurchases()` take no recipe settings and pass their options to the SDK as they are.
 */
const callOptions = (signal: AbortSignal | undefined) => (signal ? { signal } : {})

/** RFC 9562 UUID text, such as `6ba7b810-9dad-11d1-80b4-00c04fd430c8`. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A whole number as the Unity SDK spells a `long`: no sign for zero, no leading zeros, no spaces. */
const DECIMAL = /^(0|-?[1-9]\d*)$/

/** The range of a `long`. The Unity SDK cannot build a value for a player ID outside it. */
const LONG_MIN = BigInt('-9223372036854775808')
const LONG_MAX = BigInt('9223372036854775807')

/**
 * Builds the `accountUuid` of a purchase: the UUIDv5 (RFC 9562, section 5.5) of the player ID under your game's namespace.
 * It matches `AccountUuid` in the Hive Axyl SDK for Unity, so the same player gets the same value on every platform.
 * Choose the namespace once and never change it. Pass the player ID from `axyl.session.playerId()` as is.
 * Returns `null` when `namespace` is not a UUID or `playerId` is not a plain decimal number. A typo must not become a different account.
 * It uses Web Crypto, so it returns `null` on a page that is not secure.
 *
 * @example
 * const uuid = await accountUuid(GAME_NAMESPACE, axyl.session.playerId() ?? '')
 */
export async function accountUuid(namespace: string, playerId: string): Promise<string | null> {
  if (typeof namespace !== 'string' || !UUID.test(namespace)) return null
  // The Unity SDK hashes the decimal spelling of a `long`, so `0123` or ` 123` would give another value.
  if (typeof playerId !== 'string' || !DECIMAL.test(playerId)) return null
  const id = BigInt(playerId)
  if (id < LONG_MIN || id > LONG_MAX) return null
  if (globalThis.crypto?.subtle === undefined) return null
  const ns = namespace.replaceAll('-', '')
  const name = new TextEncoder().encode(playerId)
  const input = new Uint8Array(16 + name.length)
  for (let i = 0; i < 16; i++) input[i] = Number.parseInt(ns.slice(i * 2, i * 2 + 2), 16)
  input.set(name, 16)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', input))
  // The first 16 bytes of the SHA-1 hash, with the version set to 5 and the variant set to RFC 4122.
  hash[6] = (hash[6]! & 0x0f) | 0x50
  hash[8] = (hash[8]! & 0x3f) | 0x80
  const hex = Array.from(hash.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
