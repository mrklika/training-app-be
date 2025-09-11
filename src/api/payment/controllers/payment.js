"use strict";

module.exports = {
  async checkout(ctx) {
    const { companyId, priceId } = ctx.request.body;
    const service = strapi.service("api::payment.payment");
    const session = await service.createCheckoutSession(companyId, priceId);
    ctx.body = { url: session.url };
  },

  async cancel(ctx) {
    const { subscriptionId } = ctx.request.body;
    const service = strapi.service("api::payment.payment");
    const result = await service.cancelSubscription(subscriptionId);
    ctx.body = result;
  },
};
