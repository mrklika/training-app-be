export default () => {
  return async (ctx, next) => {
    const authHeader = ctx.request.header.authorization;

    if (authHeader && authHeader.startsWith('Bearer')) {

      const token = authHeader.substring(7);

      try {
        // Check token and get payload
        const { id } = await strapi
          .plugin('users-permissions')
          .service('jwt')
          .verify(token);
        if (id) {
          const user = await strapi.entityService.findOne(
            'plugin::users-permissions.user',
            id,
            {
              populate: ['company'],
            }
          );
          if (user) {
            ctx.state.user = {
              id: user.documentId ?? undefined,
              companyId: user.company?.documentId ?? undefined,
            };
          }
        }
      } catch (err) {
        // Let ctx.state.user = undefined
      }
    }

    await next();
  };
};
