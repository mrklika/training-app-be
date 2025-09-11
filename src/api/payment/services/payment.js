"use strict";
const Stripe = require("stripe");
// @ts-ignore
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = {
  async createCheckoutSession(companyId, planId) {
    const plan = await strapi.entityService.findOne("api::plan.plan", planId);

    if (!plan || !plan.stripePriceId) {
      throw new Error("Plan not configured with Stripe price");
    }

    const company = await strapi.entityService.findOne("api::company.company", companyId);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      customer_email: company.contactEmail,
      success_url: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing/cancel`,
    });

    return session;
  },
  async cancelSubscription(stripeSubscriptionId) {
    return await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  },
};
