// This file controls all the users-permissions actions
// POST should always add companyId do the request by authenticated user
// Other methods should be checked for user x companyId
// Permissions for executions are handled in ADMIN (only role author can perform actions)

const bcrypt = require('bcrypt');

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

  const rawAuth = plugin.controllers.auth({ strapi });
    const auth = ({ strapi }) => {
      return {
        ...rawAuth,
        callback: async(ctx) => {
          try {
            const { identifier, password } = ctx.request.body;

            if (!identifier || !password) {
              return ctx.badRequest('Identifier and password are required');
            }

            const user = await strapi.db.query('plugin::users-permissions.user').findOne({
              where: {
                $or: [{ email: identifier }],
              },
            });

            if (!user) {
              return ctx.badRequest('Invalid credentials');
            }

            if (!user.confirmed) {
              return ctx.badRequest('Your account email is not confirmed');
            }

            if (user.blocked) {
              return ctx.badRequest('Your account has been blocked');
            }

            const valid = await bcrypt.compare(password, user.password);
            
            if (!valid) {
              return ctx.badRequest('Invalid credentials');
            }

            const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });

            ctx.body = {
              jwt,
              user: sanitizeOutput(user),
            };
          } catch (err) {

          }
        },
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
            confirmationToken: crypto.randomUUID(),
          };

          // Create user
          const user = await strapi.entityService.create('plugin::users-permissions.user', {
            data: userData,
            populate: ['company', 'role'],
          });

          if (!user) {
            return ctx.badRequest('Failed to register user');
          }

          try {
            await strapi.plugin('users-permissions').service('user').sendConfirmationEmail(user);
          } catch (err) {
            return ctx.badRequest('Failed to send confirmation email');
          }

          try {
            // Vytvořit rovnou free subscription přes payment service
            const paymentService = strapi.service("api::payment.payment");
            await paymentService.createSubscription(user.documentId, 'free');
          } catch (err) {
            return ctx.badRequest('Failed to create subscription for user', err);
          }

          return { success: true }
        },
        resetPassword: async (ctx) => {

          const { password, code } = ctx.request.body;

          if (!password || !code) {
            return ctx.badRequest('Password and code are required');
          }

          // Find user by resetPasswordToken
          const user = await strapi.db.query('plugin::users-permissions.user').findOne({
            where: { resetPasswordToken: code },
          });

          if (!user) {
            return ctx.badRequest('Invalid reset password token');
          }

          // Update user's password and clear token
          await strapi.entityService.update(
            'plugin::users-permissions.user',
            user.id,
            {
              data: {
                password,
                resetPasswordToken: null,
                confirmed: true,
              },
            }
          );

          const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id });

          ctx.body = {
            jwt,
            user: sanitizeOutput(user),
          };
        }
    };
  };

  plugin.controllers.auth = auth;

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

    const [userToUpdate] = await strapi.entityService.findMany(
      'plugin::users-permissions.user',
      {
        filters: { documentId },
        populate: ['company', 'role'],
      }
    );

    if (!userToUpdate) return ctx.notFound('User not found');

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

      const isCurrentUserAuthor = userToUpdate.role?.type === 'author';

      if (activeAuthorsCount <= 1 && isCurrentUserAuthor && userToUpdate.documentId !== currentUser.documentId) {
        return ctx.badRequest('Cannot block this author');
      }
    }

    if (ctx.request.body?.data) {
      ctx.request.body.data.company = currentUser.companyId;
    }

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

  /**
   * POST /users override
   */
  plugin.controllers.user.create = async (ctx) => {
    await populateUserFromToken(ctx);
    const currentUser = ctx.state.user;

    if (!currentUser?.companyId) {
      return ctx.unauthorized('User has no company');
    }

    const { username, email, fullName, mode } = ctx.request.body;

    // Validate required fields
    if (!username || !email || !fullName || !mode) {
      return ctx.badRequest('Some of the values needed for user creation are missing');
    }

    // Find authenticated role
    let role;

    if (mode === 'STUDENT') {
      role  = await strapi.db.query('plugin::users-permissions.role').findOne({
        where: { type: 'authenticated' },
      });
    } else {
      role = await strapi.db.query('plugin::users-permissions.role').findOne({
        where: { type: 'author' },
      });
    }

    if (!role) {
      return ctx.badRequest('Role not found');
    }

    // Generate random password
    const password = generateRandomPassword();

    // Prepare user data
    const userData = {
      username,
      email,
      password,
      fullName,
      company: currentUser.companyId,
      role: role.id,
    };

    // Create user
    const user = await strapi.entityService.create('plugin::users-permissions.user', {
      data: userData,
    });

    if (!user) {
      return ctx.badRequest('Failed to create user');
    }

    // Send forgot password email
    ctx.request.body = { email: user.email };
    await strapi
      .plugin('users-permissions')
      .controller('auth')
      .forgotPassword(ctx);

    // Return sanitized user
    ctx.body = sanitizeOutput(user);
  };

  return plugin;
};

/**
 * Helper function to generate a random password meeting the regex pattern
 * /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/
 */
const generateRandomPassword = () => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const special = '!@#$%^&*(),.?":{}|<>';
  const allChars = uppercase + uppercase.toLowerCase() + digits + special;

  // Ensure at least one uppercase, one digit, one special character
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill the rest to reach minimum length of 8
  for (let i = password.length; i < 16; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  password = password.split('').sort(() => Math.random() - 0.5).join('');

  return password;
};