export default () => {
  return async (ctx, next) => {
    const user = ctx.state.user;

    // POST company attached
    if (
      ctx.request.method === 'POST' &&
      ctx.request.body?.data &&
      user?.companyId
    ) {
      ctx.request.body.data.company = user.companyId;
    }

    await next();
  };
};
