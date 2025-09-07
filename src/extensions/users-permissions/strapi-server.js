module.exports = (plugin) => {
  const sanitizeOutput = (user) => {
    const {
      password,
      resetPasswordToken,
      confirmationToken,
      ...sanitizedUser
    } = user;

    return sanitizedUser;
  };
  plugin.controllers.user.me = async (ctx) => {
    const user = await strapi.query("plugin::users-permissions.user").findOne({
      where: { id: ctx.state.user.id },
      populate: { company: true },
    });

    if (!user) {
      return ctx.unauthorized();
    }

    ctx.body = await sanitizeOutput(user, ctx);
  };

  return plugin;
};