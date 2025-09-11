"use strict";
const Stripe = require("stripe");
// @ts-ignore
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = {
  async handle(ctx) {
    const sig = ctx.request.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        ctx.request.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      ctx.status = 400;
      ctx.body = `Webhook Error: ${err.message}`;
      return;
    }

    switch (event.type) {

      // ======================================
      case "checkout.session.completed": {
        const session = event.data.object;

        // 1️⃣ Najdi firmu podle metadata.companyId
        const company = await strapi.db.query("api::company.company").findOne({
          where: { id: session.metadata.companyId }
        });
        if (!company) break;

        // 2️⃣ Najdi plán podle stripePriceId
        const plan = await strapi.db.query("api::plan.plan").findOne({
          where: { stripePriceId: session.display_items?.[0]?.price?.id }
        });

        // 3️⃣ Vytvoř subscription
        await strapi.db.query("api::subscription.subscription").create({
          data: {
            company: company.id,
            plan: plan?.id || null,
            stripeSubscriptionId: session.subscription,
            stripePriceId: session.display_items?.[0]?.price?.id,
            status: "active",
            currentPeriodStart: new Date(session.subscription_start * 1000),
            currentPeriodEnd: new Date(session.subscription_end * 1000),
            cancelAtPeriodEnd: false,
          },
        });

        break;
      }

      // ======================================
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;

        // 1️⃣ Najdi firmu
        const company = await strapi.db.query("api::company.company").findOne({
          where: { id: invoice.metadata.companyId }
        });
        if (!company) break;

        // 2️⃣ Vytvoř PaymentLog / Invoice
        await strapi.db.query("api::invoice.invoice").create({
          data: {
            stripeInvoiceId: invoice.id,
            company: company.id,
            subscription: invoice.subscription ? { connect: [{ stripeSubscriptionId: invoice.subscription }] } : undefined,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: "paid",
            raw: invoice,
          },
        });

        // 3️⃣ Aktualizuj Subscription (currentPeriodEnd a status)
        if (invoice.subscription) {
          const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription);
          await strapi.db.query("api::subscription.subscription").update({
            where: { stripeSubscriptionId: stripeSub.id },
            data: {
              status: stripeSub.status,
              currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
              currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            },
          });
        }

        break;
      }

      // ======================================
      case "invoice.payment_failed": {
        const invoice = event.data.object;

        // 1️⃣ Najdi firmu
        const company = await strapi.db.query("api::company.company").findOne({
          where: { id: invoice.metadata.companyId }
        });
        if (!company) break;

        // 2️⃣ Vytvo PaymentLog / Invoice
        await strapi.db.query("api::invoice.invoice").create({
          data: {
            stripeInvoiceId: invoice.id,
            company: company.id,
            subscription: invoice.subscription ? { connect: [{ stripeSubscriptionId: invoice.subscription }] } : undefined,
            amount: invoice.amount_due,
            currency: invoice.currency,
            status: "failed",
            raw: invoice,
          },
        });

        // 3️⃣ Aktualizuj Subscription status
        if (invoice.subscription) {
          await strapi.db.query("api::subscription.subscription").update({
            where: { stripeSubscriptionId: invoice.subscription },
            data: { status: "past_due" },
          });
        }

        break;
      }

      // ======================================
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    ctx.body = { received: true };
  },
};
