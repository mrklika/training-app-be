"use strict";

module.exports = {
  async populateUserFromToken(ctx) {
    const authHeader = ctx.request.header.authorization;
    // No Authorization header, skip
    if (!authHeader) return; 

    const token = authHeader.replace('Bearer ', '');

    try {
      // Verify the JWT token and get the user ID
      const { id } = await strapi
        .plugin('users-permissions')
        .service('jwt')
        .verify(token);

      if (id) {
        // Fetch user entity from Strapi
        const user = await strapi.entityService.findOne(
          'plugin::users-permissions.user',
          id,
          { populate: ['company'] } // populate company relation
        );

        if (user) {
          // Save user info in ctx.state using documentId (custom identifier)
          ctx.state.user = {
            id: user.documentId ?? undefined,
            companyId: user.company?.documentId ?? undefined,
          };
        }
      }
    } catch (err) {
      // If token is invalid or user not found, ctx.state.user remains undefined
    }
  },
  async checkout(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized("User not authenticated");

    const { plan } = ctx.request.body;
    const service = strapi.service("api::payment.payment");

    const result = await service.createSubscription(user.id, plan);

    ctx.body = result; // { url } pro placené, { subscription } pro free
  },

  async cancel(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized("User not authenticated");

    const { subscriptionId } = ctx.request.body;
    const service = strapi.service("api::payment.payment");
    const result = await service.cancelSubscription(subscriptionId, user.id);

    ctx.body = result;
  },

async subscription(ctx) {
  await this.populateUserFromToken(ctx);
  const user = ctx.state.user;

  if (!user?.companyId) {
    return ctx.unauthorized('User has no company');
  }

  const company = await strapi.documents('api::company.company').findOne({
    documentId: user.companyId,
    subscriptionStatus: 'active',
    populate: {
      subscription: {
        populate: ['plan'],
      },
    },
  });

  if (!company || !company.subscription) {
    return null;
  }

  return { ...company.subscription };
}
};
