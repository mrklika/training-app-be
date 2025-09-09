export default ({ env }) => ({
  'users-permissions': {
    config: {
      register: {
        allowedFields: ['company', 'fullName'],
      },
    },
  },
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: 'quincy.hane@ethereal.email',
          pass: 'dXQT2snqRVqqZn8trp',
        },
      },
      settings: {
        defaultFrom: 'noreply@mojedomena.cz',
        defaultReplyTo: 'noreply@mojedomena.cz',
      },
    },
  },
});