"use strict";
const Stripe = require("stripe");
// @ts-ignore
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = {
  async createSubscription(userId, plan) {

    // Najdi company podle uživatele
    const company = await strapi.db.query("api::company.company").findOne({
      where: { users: { documentId: userId } },
      populate: { subscription: true },
    });


    if (!company) {
      throw new Error("Company not found for this user");
    }

    // Free plan → rovnou aktivace
    if (plan === "free") {
      try {
        const planRecord = await strapi.db.query("api::plan.plan").findOne({
          where: { reference: "free" }
        });

        if (!planRecord) {
          throw new Error("Record not found");
        }

        const subscription = await strapi.documents('api::subscription.subscription').create({
          data: {
            company: company.documentId,
            plan: planRecord.documentId,
            subscriptionStatus: "active",
            currentPeriodStart: new Date(),
            currentPeriodEnd: null,
          },
        })

        return { subscription };
      } catch (err) {
        console.error('Failed to create subscription:', err);
      }
    }

    // Placené plány → Stripe checkout
    const stripePlanMap = {
      basic: process.env.STRIPE_BASIC_PRICE_ID,
      pro: process.env.STRIPE_PRO_PRICE_ID,
      enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    };

    if (!stripePlanMap[plan]) {
      throw new Error("Invalid plan for checkout");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: stripePlanMap[plan], quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/success`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
      metadata: { companyId: company.id, plan },
    });

    return { url: session.url };
  },

  async cancelSubscription(subscriptionId, userId) {
    // Ověření, že subscription patří company uživatele
    const company = await strapi.db.query("api::company.company").findOne({
      where: { users: { id: userId } },
      populate: { subscription: true },
    });

    if (!company) {
      throw new Error("Company not found for this user");
    }

    const subscription = await strapi.db.query("api::subscription.subscription").findOne({
      where: { id: subscriptionId, company: company.id },
    });

    if (!subscription) {
      throw new Error("Subscription not found or not owned by your company");
    }

    return await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  },
};
