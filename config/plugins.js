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
          user: 'nona.kassulke7@ethereal.email',
          pass: '57tjrhKhdRQf91zzMN',
        },
      },
      settings: {
        defaultFrom: 'noreply@mojedomena.cz',
        defaultReplyTo: 'noreply@mojedomena.cz',
      },
    },
  },
});