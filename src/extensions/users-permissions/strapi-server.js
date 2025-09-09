module.exports = (plugin) => {

  const rawAuth = plugin.controllers.auth({ strapi });

  const auth = ({ strapi }) => {
    return {
      ...rawAuth,
      register: async (ctx) => {
        const { username, email, password, fullName, company } = ctx.request.body;

        // Validate required fields
        if (!username || !email || !password || !fullName || !company) {
          return ctx.badRequest('Some of the values needed for registration are missing');
        }

        // Find Author role
        const authorRole = await strapi.db.query('plugin::users-permissions.role').findOne({
          where: { type: 'author' },
        });

        if (!authorRole) {
          return ctx.badRequest('Role not found');
        }

        // Prepare user data
        const userData = {
          username,
          email,
          password,
          fullName,
          company,
          role: authorRole.id,
        };

        // Create user
        const user = await strapi.entityService.create('plugin::users-permissions.user', {
          data: userData,
          populate: ['company', 'role'], // pokud chceš rovnou načíst relace
        });

        if (!user) {
          return ctx.badRequest('Failed to register user');
        }

        // Generate JWT
        const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });

        // Return sanitized user
        ctx.body = {
          jwt,
          user: sanitizeOutput(user),
        };
      },
    };
  };

  plugin.controllers.auth = auth;

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

  /**
   * PUT /users/:id override
   */
  plugin.controllers.user.update = async (ctx) => {
    await populateUserFromToken(ctx);
    const currentUser = ctx.state.user;

    if (!currentUser?.companyId) {
      return ctx.unauthorized('User has no company');
    }

    const documentId = ctx.params.id;
    if (!documentId) return ctx.badRequest('Missing record id');

    // Najdi uživatele podle documentId
    const [userToUpdate] = await strapi.entityService.findMany(
      'plugin::users-permissions.user',
      {
        filters: { documentId },
        populate: ['company', 'role'],
      }
    );

    if (!userToUpdate) return ctx.notFound('User not found');

    // Ověř, že patří do stejné company
    if (userToUpdate.company?.documentId !== currentUser.companyId) {
      return ctx.forbidden('Not authorized to manipulate the record');
    }

    const blocked = ctx.request.body?.blocked;

    if (blocked === true) {
      const activeAuthorsCount = await strapi.db.query('plugin::users-permissions.user').count({
        where: {
          company: { documentId: currentUser.companyId },
          blocked: false,
          role: { type: 'author' },
        },
      });

      // Pokud je aktivní author pouze tento
      const isCurrentUserAuthor = userToUpdate.role?.type === 'author';

      if (activeAuthorsCount <= 1 && isCurrentUserAuthor) {
        return ctx.badRequest('Cannot block the last active author in the company');
      }
    }

    // Zajisti správné přiřazení company
    if (ctx.request.body?.data) {
      ctx.request.body.data.company = currentUser.companyId;
    }

    // Proveď update přes interní PK
    const updatedUser = await strapi.entityService.update(
      'plugin::users-permissions.user',
      userToUpdate.id,
      {
        data: ctx.request.body,
        populate: ['company'],
      }
    );

    ctx.body = sanitizeOutput(updatedUser);
  };

  return plugin;
};
