const dayjs = require("dayjs");

module.exports = {
  myJob: {
    task: async ({ strapi }) => {

      try {
        const now = new Date();
        const oneMonthFromNow = new Date();
        oneMonthFromNow.setMonth(now.getMonth() + 1);
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(now.getMonth() + 3);

        const trainings = await strapi.db.query('api::user-training.user-training').findMany({
          where: {
            $and: [
              {
                $or: [
                  { dueDate: { $gte: now, $lte: threeMonthsFromNow } },
                  { dueDate: { $lt: now } },
                ],
              },
              { completeDate: { $null: true } },
            ],
          },
          populate: ['student', 'company', 'training'],
        });

        for (const training of trainings) {

          if (!training.student?.email || !training.company?.contactEmail) {
            continue;
          }

          const dueDate = new Date(training.dueDate);
          let severity = '';

          if (dueDate < now) {
            severity = 'OVERDUE';
          } else if (dueDate <= oneMonthFromNow) {
            severity = 'HIGH';
          } else if (dueDate <= threeMonthsFromNow) {
            severity = 'MEDIUM';
          } else {
            severity = 'LOW';
          }

          if (training.emailSentSeverity === severity) {
            continue;
          }

          await strapi
            .plugin("email-designer-5")
            .service("email")
            .sendTemplatedEmail({
              to: training.student.email,
              bcc: training.company.contactEmail
            },
              {
                templateReferenceId: 1,
              },
              {
                studentFullName: training.student.fullName,
                trainingTitle: training.training.title,
                trainingDueDate: dayjs(training.dueDate).format("DD. MM. YYYY"),
              }
            );

          await strapi.db.query('api::user-training.user-training').update({
            where: { id: training.id },
            data: { emailSentSeverity: severity },
          });

          strapi.log.info(`Email processed: ${training.id} -> ${training.student.email}, ${training.company.contactEmail} (${severity})`);
        }
      } catch (error) {
        strapi.log.error('Cron job failed', error);
      }
    },
    options: {
      rule: "*/10 * * * * *",
    },
  },
};