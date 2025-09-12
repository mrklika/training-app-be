// This file controls all the CRUD actions
// POST should always add companyId do the request by authenticated user
// Other methods should be checked for user x companyId
// Permissions for executions are handled in ADMIN (only role author can perform actions)

const { factories } = require('@strapi/strapi');

module.exports = (uid) =>
  factories.createCoreController(uid, ({ strapi }) => ({
    /**
     * Populate the current user from JWT token in the Authorization header.
     * Sets ctx.state.user with { id, companyId } using documentId fields.
     */
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

    /**
     * Find many records.
     * Automatically filters records by the current user's companyId.
     * Supports standard query params like populate, fields, etc.
     */
    async find(ctx) {
      await this.populateUserFromToken(ctx);
      const user = ctx.state.user;

      if (!user?.companyId) {
        return ctx.unauthorized('User has no company');
      }

      try {
        await this.validateQuery(ctx);
      } catch (err) {
        return ctx.badRequest('Invalid query parameters');
      }

      const sanitizedQueryParams = await this.sanitizeQuery(ctx);

      // Apply company filter
      sanitizedQueryParams.filters = {
        ...sanitizedQueryParams.filters,
        company: { documentId: user.companyId },
      };

      try {
        // findMany returns an array directly
        const items = await strapi.documents(uid).findMany(sanitizedQueryParams);

        // Compute pagination manually if needed
        const pagination = {
          page: sanitizedQueryParams.pagination?.page || 1,
          pageSize: sanitizedQueryParams.pagination?.pageSize || 25,
          pageCount: Math.ceil(items.length / (sanitizedQueryParams.pagination?.pageSize || 25)),
          total: items.length,
        };

        // Sanitize the output
        const sanitizedResults = await this.sanitizeOutput(items || [], ctx);

        // Return the response in Strapi's expected format
        return this.transformResponse(sanitizedResults, { pagination });
      } catch (err) {
        return ctx.internalServerError('An error occurred while fetching records');
      }
    },
    
    /**
     * Find one record.
     * Automatically filter record by the current user's companyId.
     * Supports standard query params like populate, fields, etc.
     */
    async findOne(ctx) {
      await this.populateUserFromToken(ctx);
      const user = ctx.state.user;

      if (!user?.companyId) {
        return ctx.unauthorized('User has no company');
      }

      const documentId = ctx.params.id;
      if (!documentId) {
        return ctx.badRequest('Missing record id');
      }

      try {
        await this.validateQuery(ctx);
      } catch (err) {
        return ctx.badRequest('Invalid query parameters');
      }

      const sanitizedQueryParams = await this.sanitizeQuery(ctx);

      // Apply company filter
      sanitizedQueryParams.filters = {
        ...sanitizedQueryParams.filters,
        company: { documentId: user.companyId },
      };

      try {
        // findOne returns a single object or null
        const item = await strapi.documents(uid).findOne({
          documentId,
          ...sanitizedQueryParams,
        });

        if (!item) {
          return this.transformResponse(null, { meta: {} });
        }

        // Sanitize the output
        const sanitizedResult = await this.sanitizeOutput(item, ctx);

        // Return the response in Strapi's expected format
        return this.transformResponse(sanitizedResult, { meta: {} });
      } catch (err) {
        return ctx.internalServerError('An error occurred while fetching the record');
      }
    },

    /**
    * Create a new record.
    * Automatically assigns the current user's companyId.
    */
    async create(ctx) {
      await this.populateUserFromToken(ctx);
      const user = ctx.state.user;

      // API COMPANY
      // create company exception
      if (ctx.request.url.startsWith('/api/companies')) {
        return await super.create(ctx);
      }

      if (!user?.companyId) {
        return ctx.unauthorized('User has no company');
      }

      // API USER_TRAINING
      if (ctx.request.url.startsWith('/api/user-trainings')) {
        const studentId = ctx.request.body.data?.student;
        const trainingId = ctx.request.body.data?.training;

        if (studentId) {
          const student = await strapi.db.query('plugin::users-permissions.user').findOne({
            where: { documentId: studentId },
            select: ['id', 'blocked', 'company'],
          });

          if (!student) {
            return ctx.badRequest('Record not found');
          }

          if (student.blocked) {
            return ctx.badRequest('Cannot assign training to blocked user');
          }

          if (student.company !== user.companyId) {
            return ctx.forbidden('User does not belong to your company');
          }
        }

        if (trainingId) {
          const training = await strapi.db.query('api::training.training').findOne({
            where: { documentId: trainingId },
            select: ['id', 'company'],
          });

          if (!training) {
            return ctx.badRequest('Record not found');
          }

          if (training.company !== user.companyId) {
            return ctx.forbidden('Cannot assign training from a different company');
          }
        }
      }

      ctx.request.body.data.company = user.companyId;

      return await super.create(ctx);
    },

    /**
     * Update a new record.
     * Check current user's companyId.
     */
    async update(ctx) {
      await this.populateUserFromToken(ctx);
      const user = ctx.state.user;

      if (!user?.companyId) return ctx.unauthorized('User has no company');

      const documentId = ctx.params.id;
      if (!documentId) return ctx.badRequest('Missing record id');

      const isCompanyEntity = uid === 'api::company.company';

      const record = await strapi.documents(uid).findOne({
        documentId,
        ...(isCompanyEntity ? {} : { populate: ['company'] }),
      });

      if (!record) return ctx.notFound('Record not found');

      // Multi-tenant check
      if (isCompanyEntity) {
        // U company kontrolujeme jen documentId
        if (record.documentId !== user.companyId) {
          return ctx.forbidden('Not authorized to update this company');
        }
      } else {
        // Check company association on different entities
        if (record.company?.documentId !== user.companyId) {
          return ctx.forbidden('Not authorized to manipulate the record');
        }

        // Assign companyId
        if (ctx.request.body?.data) {
          ctx.request.body.data.company = user.companyId;
        }
      }

      return await super.update(ctx);
    },

    /**
     * Delete an existing record.
     * Checks that the record belongs to the current user's company.
     */
    async delete(ctx) {
      await this.populateUserFromToken(ctx);
      const user = ctx.state.user;

      if (!user?.companyId) return ctx.unauthorized('User has no company');

      const documentId = ctx.params.id;
      if (!documentId) return ctx.badRequest('Missing record id');

      // Find the record using documentId instead of internal Strapi id
      const record = await strapi.documents(uid).findOne({
        documentId,
        populate: ['company'],
      });

      if (!record) return ctx.notFound('Record not found');

      // Multi-tenant check
      if (record.company?.documentId !== user.companyId) {
        return ctx.forbidden('Not authorized to manipulate the record');
      }

      // Call default core delete logic
      return await super.delete(ctx);
    },

    /**
     * Count records by companyId filter.
     */
    async count(ctx) {
      await this.populateUserFromToken(ctx);
      const user = ctx.state.user;

      if (!user?.companyId) {
        return ctx.unauthorized('User has no company');
      }

      const sanitizedQuery = await this.sanitizeQuery(ctx);

      // Apply company filter
      sanitizedQuery.filters = {
        ...sanitizedQuery.filters,
        company: { documentId: user.companyId },
      };

      const total = await strapi.documents(uid).count(sanitizedQuery);

      return { count: total };
    },

  }));
