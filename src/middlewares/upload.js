module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    // Only process requests for upload endpoints
    if (ctx.request.url.includes('/api/upload')) {
      let companyId = 'default';

      // Extract JWT token from Authorization header
      const authHeader = ctx.request.header.authorization;
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        try {
          const { id } = await strapi
            .plugin('users-permissions')
            .service('jwt')
            .verify(token);

          if (id) {
            // Fetch user entity with company relation
            const user = await strapi.entityService.findOne(
              'plugin::users-permissions.user',
              id,
              { populate: ['company'] }
            );

            if (user && user.company?.documentId) {
              companyId = user.company.documentId;
            }
          }
        } catch (err) {
          // Proceed with default companyId if token verification fails
        }
      }

      // Store companyId in ctx.state
      ctx.state.companyId = companyId;

      // Attach companyId to files
      const files = ctx.request.files?.files;
      if (files) {
        const filesArray = Array.isArray(files) ? files : [files];
        for (const file of filesArray) {
          file.originalFilename = companyId + '_' + file.originalFilename;
        }
      }
    }

    await next();
  };
};