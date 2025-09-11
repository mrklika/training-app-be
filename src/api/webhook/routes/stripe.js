module.exports = {
  routes: [
    {
      method: "POST",
      path: "/webhooks/stripe",
      handler: "stripe.handle",
      config: {
        auth: { 
          public: true   // = musí být přihlášený
        },
        policies: [],
      },
    },
  ],
};