'use strict';

/**
 * user-training service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::user-training.user-training');
