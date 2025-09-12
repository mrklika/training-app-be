module.exports = {
  routes: [
    {
      method: "POST",
      path: "/payment/checkout",
      handler: "payment.checkout",
      config: {
        auth: { 
          public: false
        }
      },
    },
    {
      method: "POST",
      path: "/payment/cancel",
      handler: "payment.cancel",
      config: {
        auth: { 
          public: false
        }
      },
    },
    {
      method: "GET",
      path: "/payment/subscription",
      handler: "payment.subscription",
      config: { 
        auth: {
          public: false
        }
      },
    },
  ],
};