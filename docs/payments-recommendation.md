# Payment Processing Recommendation — Online Giving

*Prepared August 2026 for the JUMPSTART USA platform (React + NestJS on Azure), following the move to
native in-platform donor management (§6.8). Pricing verified as of August 2026; nonprofit rates
require application and approval, so model standard rates until approval lands.*

## Recommendation: Stripe (with the approved nonprofit rate)

Stripe is the recommended processor to link to the platform for online donations. It is the only
option that simultaneously:

1. **Beats or matches every alternative on total cost once the nonprofit rate is approved** —
   2.2% + $0.30 on cards and digital wallets (vs 2.9% + $0.30 standard), and ACH direct debit at
   0.8% **capped at $5** — the cap is reached at a $625 gift, which makes large recurring gifts
   nearly free to process.
2. **Has the best developer API for our stack** — official typed Node SDK, first-class webhooks,
   idempotency keys, test clocks for subscription testing; ideal for the NestJS API.
3. **Covers every payment type we want in one integration** — one-time, monthly recurring, ACH,
   cards, Apple Pay and Google Pay all through a single Payment Element component in React.
4. **Keeps PCI compliance at SAQ A** — card data never touches our API or Azure infrastructure
   (Stripe-hosted iframe fields).
5. **Is platform-agnostic** — pure REST + webhooks; secrets live in Azure Key Vault; the webhook
   endpoint is just another route on the existing API.

### Action item (no code required)

Apply for the Stripe nonprofit rate **before** integration work: contact Stripe support /
nonprofit@stripe.com with the EIN and 501(c)(3) determination letter. Requirement: ≥ 80% of Stripe
volume must be tax-deductible donations. The discount is not retroactive.

### Integration sketch (when we build it)

- **React (web + future public giving page):** Stripe.js Payment Element — cards, Apple/Google Pay,
  and `us_bank_account` ACH in one component. Donor-covers-fees is a client-side gross-up
  (`charge = (gift + 0.30) / (1 − 0.022)`) re-validated server-side.
- **NestJS:** create a PaymentIntent for one-time gifts; for monthly donors, vault the payment
  method with a SetupIntent and schedule `off_session` PaymentIntents from the API — this avoids
  Stripe Billing's extra 0.7% fee; adopt Billing later only if we want its smart retries/dunning.
- **Webhooks:** `payment_intent.succeeded` / `invoice.paid` create Donation rows (linked to the
  donor's RecurringGift schedule where applicable) and trigger the acknowledgment queue;
  `charge.refunded` and `payout.paid` feed reconciliation.
- **Secrets:** Stripe secret key + webhook signing secret in Azure Key Vault; raw-body signature
  verification on the webhook route.

## Runner-up: PayPal Braintree

Cheaper per transaction if its charity rate (~1.99% + $0.49) is approved, ACH at 0.75% capped at $5,
recurring billing included at no extra percentage, and it uniquely bundles native PayPal + Venmo
with cards and ACH in one gateway. It loses on developer experience, onboarding speed, and the
$0.49 fixed fee hurts small gifts (~7% of a $10 donation).

**Pragmatic hybrid** many nonprofits use: Stripe as the primary processor plus a plain PayPal
"Donate" button (confirmed-charity rate 1.99% + $0.49) for wallet-first donors — easy to add later.

## Ruled out

| Option | Why not |
| --- | --- |
| Givebutter / Donorbox | Hosted platforms — their APIs sync data but **cannot process payments**, wasting our custom checkout; Donorbox also stacks a 1.6–2.95% platform fee on top of Stripe/PayPal processing. |
| Square | No nonprofit discount at all; strictly worse economics than Stripe's nonprofit rate. |
| Neon Pay | Captive payment layer of Neon CRM (Worldpay-based); not available standalone to third-party apps, and pricier (2.99% + $0.30 cards, 1% + $1 ACH). |
| Bloomerang Payments | In-CRM processor for Bloomerang subscribers only (Spreedly/BluePay under the hood); requires adopting Bloomerang, which the native Development module replaces. |
