import { Application, Router, type Context, type State } from "oak";
import { applyCors } from "./_shared/cors.ts";
import { securityHeaders } from "./_shared/headers.ts";
import { errorHandler } from "./_shared/error.ts";
import { rateLimit } from "./_shared/ratelimit.ts";
import authRouter from "./routers/auth.ts";
import reportsRouter from "./routers/reports.ts";
import matchesRouter from "./routers/matches.ts";
import claimsRouter from "./routers/claims.ts";
import notificationsRouter from "./routers/notifications.ts";
import adminRouter from "./routers/admin.ts";
import eventsRouter from "./routers/events.ts";
import categoriesRouter from "./routers/categories.ts";
import communitiesRouter from "./routers/communities.ts";
import searchRouter from "./routers/search.ts";
import foundFeedRouter from "./routers/foundFeed.ts";
import chatRouter from "./routers/chat.ts";

const app = new Application<State>();

// Order matters: errorHandler first (wraps everything so HTTP errors still get CORS/security
// headers), then CORS, security headers, rate limiting, then routers.
app.use(errorHandler());
app.use(applyCors());
app.use(securityHeaders());
app.use(rateLimit());

const health = (ctx: Context) => {
  ctx.response.body = { status: "ok", timestamp: new Date().toISOString() };
};

const mount = (router: Router) => {
  app.use(router.routes());
  app.use(router.allowedMethods());
};

const healthRouter = new Router();
healthRouter.get("/health", health);
healthRouter.get("/api/health", health);
mount(healthRouter);

mount(authRouter);
mount(reportsRouter);
mount(matchesRouter);
mount(claimsRouter);
mount(notificationsRouter);
mount(adminRouter);
mount(eventsRouter);
mount(categoriesRouter);
mount(communitiesRouter);
mount(searchRouter);
mount(foundFeedRouter);
mount(chatRouter);

Deno.serve((request) => app.handle(request).then((res) => res ?? new Response(null, { status: 500 })));