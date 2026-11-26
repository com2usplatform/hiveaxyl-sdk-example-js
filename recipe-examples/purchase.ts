// Usage example: a PG shop with the payment recipe. It has no UI.
// `APP:` comments mark where your game must supply code, UI or a decision.
import type { AxylClient } from '@com2usplatform/hiveaxyl'
import type { PaymentModule, Product } from '@com2usplatform/hiveaxyl/payment'
import {
  createPayment,
  pageReturn,
  type OpenPaymentResult,
  type PaymentRegion,
  type PaymentResult,
  type Purchase,
} from '../recipes/payment'

// APP: implement `GameServer` with a call to your game server.
/**
 * Your game server. This is not an SDK interface. Supply a real implementation.
 *
 * The server calls the server-only receipt verification API of Hive Axyl with `purchase.axylReceipt`.
 * It makes that call with the paying player's access token, not with its server credentials.
 * So your implementation calls `await axyl.session.getAccessToken()` before each request and sends the token with the purchase.
 * It checks the account, the product and the price itself, and grants the items once per transaction.
 * A purchase it already granted is confirmed again without granting twice.
 * Never grant items on the client. A browser result can be changed by anyone who opens the developer tools.
 */
export interface GameServer {
  /**
   * Returns a confirmation only when the server confirmed the grant of this purchase, now or before.
   * Returns `null` when the grant is not confirmed. Never make a confirmation up on the client.
   */
  verifyAndGrant(purchase: Purchase): Promise<DeliveryConfirmation | null>
}

/** Your game server's answer after it verified and granted a purchase, like `PurchaseDeliveryConfirmation` in the Unity example. */
export interface DeliveryConfirmation {
  /**
   * Always `true`. The example closes a purchase only when this is exactly `true`,
   * so an error body such as `{ "granted": false }` or `{ "error": ... }` never closes it.
   */
  readonly granted: true
  /** The closing receipt, when the server returns a newer one. Without it, the recipe closes with the purchase's own receipt. */
  readonly receipt?: string
}

/** The `externalCode` values this example shows players instead of `error.code`. */
const RECIPE_CODES: ReadonlySet<string> = new Set([
  'WebAuthPopupBlocked',
  'Payment_InProgress',
  'Auth_SessionChanged',
])

/** The shop screens your game shows. */
export interface ShopScreens {
  showProducts(products: readonly Product[]): void
  /** Shows the items the game server granted. */
  showGranted(productId: string | undefined): void
  /** Shows a localized message for a result or error code. Never show the SDK's `message` text to players. */
  showError(code: string): void
  /** Tells the player the payment was not found yet, and offers a "check again" button. */
  showNotFound(): void
}

/**
 * Wires a PG shop. Register the `payment` module in `createAxyl` next to `auth` and `token`:
 * `modules: { auth: auth(), token: token(), payment: payment() }`.
 * The player must be signed in before any of these calls.
 */
export function createShop(
  axyl: Pick<AxylClient<{ payment: PaymentModule }>, 'payment' | 'session' | 'isDisposed'>,
  region: PaymentRegion & { readonly currency: string },
  server: GameServer,
  screens: ShopScreens,
) {
  const shop = createPayment(axyl)
  // Products as the server listed them. A purchase takes its price and currency from here.
  let products: readonly Product[] = []
  const nextReturn = onNextReturn(() => {
    // A disposed client or a signed-out player has nothing to look up.
    if (axyl.isDisposed() || !axyl.session.isSignedIn()) return
    // APP: report the error. The next sign-in or the "check again" button runs `recover()` again.
    recover().catch(() => undefined)
  })

  return {
    async loadProducts(): Promise<void> {
      const r = await shop.listProducts(region)
      if (r.kind === 'success') {
        products = r.products
        screens.showProducts(products)
        return
      }
      screens.showError(codeOf(r))
    },

    /** The buy button's click handler. */
    async onBuyClick(productId: string): Promise<void> {
      const product = products.find((p) => p.productId === productId)
      // APP: check before the call, without `await`. The payment window opens inside `openPayment`.
      // Any `await` before it lets the browser block the window.
      if (!product || product.price === undefined || product.currency === undefined) {
        screens.showError('unknown_product')
        return
      }
      // A purchase belongs to the player signed in when the payment starts.
      // `watchSignIn()` does not await, so the window still opens during the click.
      const watch = watchSignIn()
      nextReturn.paymentStarted()
      try {
        const r = await shop.openPayment({
          ...region,
          productId,
          price: product.price,
          currency: product.currency,
          // APP: put your own order reference here if your game server needs to match the purchase.
          // iapPayload: JSON.stringify({ orderRef }),
        })
        // The payment page usually opens in a tab. The recipe also looks for the purchase when the player
        // switches back to the game with that tab still open. APP: pass `onReturn` to add an "I have paid" button.
        // A result with `purchase` can end while that tab is still open, and a payment there may finish later.
        // Watch for the next return before handling the result, so a return during the grant is not lost.
        // A lookup that failed at `restore` says nothing about the payment, so watch for the next return then too.
        // So does a lookup that found nothing: the window can look closed while the player is still paying in it.
        // A cancelled window can stay open in Chromium and WebKit, and the player can still pay there.
        if (
          r.kind === 'notFound' ||
          r.purchase !== undefined ||
          (r.kind === 'failure' && r.step === 'restore') ||
          (r.kind === 'failure' && r.step === 'storePurchase' && r.error.code === 'Cancelled') ||
          (r.kind === 'businessOutcome' && r.code === 'payment_resource_not_found')
        )
          nextReturn.arm()
        await handle(r, watch)
      } finally {
        watch.stop()
        nextReturn.paymentEnded()
      }
    },

    // APP: call it after every sign-in, and from the "check again" button. `handle()` calls it after a result that may carry a paid purchase.
    // `notFound` and the other results wait for the next return to the game (see `onBuyClick()`).
    /**
     * Grants paid purchases that were not granted yet.
     * A payment can finish after the window closed, and a page can close before the grant.
     */
    recover,
  }

  async function recover(): Promise<void> {
    // A disposed client takes no SDK call. The purchases stay open for the next client's sign-in.
    if (axyl.isDisposed()) return
    // The listed purchases belong to the player signed in now.
    const watch = watchSignIn()
    try {
      const r = await shop.recoverPurchases(region)
      // The server answers this code when it has no open purchase. Nothing to recover.
      if (r.kind === 'businessOutcome' && r.code === 'payment_resource_not_found') return
      if (r.kind !== 'success') {
        // A failed lookup is not an empty list. Try again later.
        // `Auth_SessionChanged`: the list belonged to the previous player. The next sign-in runs `recover()` for the new one.
        screens.showError(codeOf(r))
        return
      }
      // One at a time within one `recover()` call, so this call never sends a purchase twice in parallel.
      // Two calls can still overlap, for example after sign-in and from the button.
      // The game server grants once per transaction (see `GameServer`), so an overlap does not grant twice.
      for (const purchase of r.purchases) await grant(purchase, watch)
    } finally {
      watch.stop()
    }
  }

  async function handle(r: OpenPaymentResult, watch: SignInWatch): Promise<void> {
    switch (r.kind) {
      case 'success':
        await grant(r.purchase, watch)
        // After a sign-out the purchase waits for its player's next sign-in. Look up nothing now.
        if (watch.changed && !axyl.session.isSignedIn()) return
        // `r.purchase` can be an earlier open purchase of the same product.
        // The one paid in this window then comes from `recover()`, now or on the next return (see `onBuyClick()`).
        await recover()
        return
      case 'notFound':
        // The window closed but the server lists no open purchase of this product yet.
        // The player may have cancelled, or the payment is still being processed.
        // The next return to the game looks again (see `onBuyClick()`), and the "check again" button does too.
        screens.showNotFound()
        return
      case 'businessOutcome':
        if (r.code === 'payment_resource_not_found' && r.purchase === undefined) {
          // The lookup found no open purchase at all. Same as `notFound`.
          // With `purchase`, recording the found payment failed with this code. That case goes on below.
          screens.showNotFound()
          return
        }
        // APP: show a message for `r.code`. Branch on the code, not on the outcome data.
        screens.showError(r.code)
        // When `r.purchase` is set, the payment was found but not recorded. `recover()` grants it.
        await recover()
        return
      case 'failure': {
        // APP: `Unavailable` with `externalCode` `WebAuthPopupBlocked` means the browser blocked the window.
        // Ask the player to press the button again, or to allow popups. Payments have no redirect fallback.
        // Inside a portal iframe (`detectEnvironment().inIframe`), ask the player to open the game outside the portal instead.
        // `Aborted` with `externalCode` `Payment_InProgress`: a payment window is already open.
        // `FailedPrecondition` with `externalCode` `Auth_SessionChanged`: the sign-in state changed during the payment.
        // Show these known codes by `externalCode`. Other values, such as `HTTP 500`, are open-ended, so show `code`.
        // `r.purchase` is set when the payment was found but not finished: recording failed,
        // the call was cancelled or the client was disposed while recording (it may or may not be recorded),
        // or the client was disposed after it.
        // Its items are not granted yet.
        // This example leaves it open. The next `recover()` grants it: on the next return to the game,
        // after sign-in, or from the "check again" button.
        const external = r.error.externalCode
        screens.showError(
          external !== undefined && RECIPE_CODES.has(external) ? external : r.error.code,
        )
        if (external === 'Auth_SessionChanged' && axyl.session.isSignedIn()) {
          // A payment made in that window stays with the player who started it.
          // This finds it when the same player signed in again. Otherwise that player's next sign-in finds it.
          await recover()
        }
        return
      }
      default:
        // A future recipe version may add a result kind. `recover()` finds any paid purchase.
        screens.showError('unknown')
    }
  }

  /**
   * Has the game server grant one purchase, then closes it.
   * Each SDK request goes out as the player signed in at that moment.
   * So after a sign-in change or `dispose()` it sends nothing more for this purchase, and it does not show the grant.
   * The purchase stays open. Its player's next `recover()` finds it, and the game server does not grant twice.
   */
  async function grant(purchase: Purchase, watch: SignInWatch): Promise<void> {
    if (watch.changed) return
    // APP: the game server verifies the receipt and grants the items. The SDK never confirms a payment.
    const delivery = await server.verifyAndGrant(purchase)
    if (watch.changed) return
    if (delivery?.granted !== true) {
      // Not granted: keep the purchase open. `recover()` brings it back.
      screens.showError('not_granted')
      return
    }
    // APP: count each purchase once. `recover()` can bring back a purchase whose grant was already shown,
    // and the confirmation looks the same both times. Redraw the balance from your game server. Do not add the amount on the client.
    screens.showGranted(purchase.productId)
    // Close only after the grant. An open purchase keeps coming back from `recover()`.
    // A closing receipt from the game server wins over the purchase's own one.
    const closed = await shop.closePurchase(
      purchase,
      delivery.receipt === undefined ? {} : { receipt: delivery.receipt },
    )
    if (closed.kind !== 'success') {
      // The items are granted. The next `recover()` closes it again, and the game server must not grant twice.
      // Log only the step and the code, never the whole result.
      console.warn('closePurchase', closed.step, codeOf(closed))
    }
  }

  /**
   * Notes any `change` event from now on: a sign-in, even by the same player, a sign-out or the end of the session.
   * This is the same rule the recipe uses between its own steps.
   * It also counts `dispose()`, which sends no `change` event. A disposed client takes no further SDK call.
   */
  function watchSignIn(): SignInWatch {
    let changed = false
    const stop = axyl.session.on('change', () => {
      changed = true
    })
    return {
      get changed() {
        return changed || axyl.isDisposed()
      },
      stop,
    }
  }
}

/** The code of a result that is not `success`: `error.code` of a `failure`, or the server's `code`. */
function codeOf(r: Exclude<PaymentResult, { kind: 'success' }>): string {
  return r.kind === 'failure' ? r.error.code : r.code
}

/**
 * Runs `lookup` once, the next time the player comes back to the game after `arm()`.
 * A return while a payment runs waits until the last payment ends: a running payment may grant the same purchase.
 */
function onNextReturn(lookup: () => void) {
  // Stops the pending one-time lookup on return. Only one is pending, however many payments ended.
  let stopNextReturn: (() => void) | undefined
  // The number of `onBuyClick()` calls running. While one runs, the recipe looks for the new purchase itself.
  // A count, not a flag: a second click ends at once with `Payment_InProgress` while the first payment goes on.
  let paying = 0
  // The player came back while a payment ran. The lookup then waits until the last payment ends.
  let returnedWhilePaying = false

  /** Runs the pending lookup once and stops waiting for a return. */
  function now(): void {
    returnedWhilePaying = false
    stopNextReturn?.()
    stopNextReturn = undefined
    lookup()
  }

  return {
    /** Waits for the next return. A wait that is already pending starts over. */
    arm(): void {
      returnedWhilePaying = false
      stopNextReturn?.()
      stopNextReturn = pageReturn(() => {
        // Do not look up from two places at once.
        if (paying > 0) returnedWhilePaying = true
        else now()
      })
    },
    paymentStarted(): void {
      paying++
    },
    /** Runs the lookup now if the player came back during the payments that just ended. */
    paymentEnded(): void {
      paying--
      // Look up now that no payment grants anything.
      if (returnedWhilePaying && paying === 0) now()
    },
  }
}

/** A sign-in watch from `watchSignIn()`. */
interface SignInWatch {
  /** `true` once the sign-in state changed or the client was disposed after the watch started. */
  readonly changed: boolean
  /** Stops watching. */
  stop(): void
}
