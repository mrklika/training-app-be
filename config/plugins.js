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
      // For email testing purpose
      providerOptions: {
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: 'erin.kuhn@ethereal.email',
          pass: 'AUgtrZAHPVpuyhjBvf',
        },
      },
      settings: {
        defaultFrom: 'noreply@mojedomena.cz',
        defaultReplyTo: 'noreply@mojedomena.cz',
      },
    },
  },
});