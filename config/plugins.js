export default ({ env }) => ({
  'users-permissions': {
    config: {
      register: {
        allowedFields: ['company', 'fullName'],
      },
    },
  },
});