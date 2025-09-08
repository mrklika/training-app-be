module.exports = (plugin) => {
  /**
   * Helper function to sanitize user output.
   * Removes sensitive fields like password, reset tokens, and confirmation tokens.
   */
  const sanitizeOutput = (user) => {
    const {
      password,
      resetPasswordToken,
      confirmationToken,
      ...sanitizedUser
    } = user;

    return sanitizedUser;
  };

  const populateUserFromToken = async (ctx) => {
    const authHeader = ctx.request.header.authorization;
    if (!authHeader) return;

    const token = authHeader.replace('Bearer ', '');
    try {
      const { id } = await strapi.plugin('users-permissions').service('jwt').verify(token);

      if (id) {
        const user = await strapi.entityService.findOne(
          'plugin::users-permissions.user',
          id,
          { populate: ['company'] }
        );

        if (user) {
          ctx.state.user = {
            id: user.documentId ?? undefined,
            companyId: user.company?.documentId ?? undefined,
          };
        }
      }
    } catch (err) {
      // ignore invalid token
    }
  };

  /**
   * GET /me override
   */
  plugin.controllers.user.me = async (ctx) => {
    // Fetch the authenticated user from the database
    const user = await strapi.query("plugin::users-permissions.user").findOne({
      where: { id: ctx.state.user.id },
      populate: { company: true },
    });

    // If no user found, return unauthorized
    if (!user) {
      return ctx.unauthorized();
    }

    // Return sanitized user data in the response body
    ctx.body = sanitizeOutput(user);
  };

  /**
   * GET /users override
   */
  plugin.controllers.user.find = async (ctx) => {
    await populateUserFromToken(ctx);
    const user = ctx.state.user;

    if (!user?.companyId) return ctx.unauthorized('User has no company');

    ctx.query.filters = {
      ...ctx.query.filters,
      company: { documentId: user.companyId },
    };

    const users = await strapi.entityService.findMany('plugin::users-permissions.user', ctx.query);

    const sanitizedUsers = users.map((u) => sanitizeOutput(u));

    ctx.body = sanitizedUsers;
  };

  return plugin;
};
