import https from "https";
import { config } from "dotenv";

import corsConfig from "./config/cors.js";
import { ratelimit } from "./config/ratelimit.js";

import {
  cacheConfigSetter,
  cacheControlMiddleware,
} from "./middleware/cache.js";
import { hianimeRouter } from "./routes/hianime.js";

import { Hono } from "hono";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

import pkgJson from "../package.json" with { type: "json" };
import { errorHandler, notFoundHandler } from "./config/errorHandler.js";
import type { AniwatchAPIVariables } from "./config/variables.js";

config();

const BASE_PATH = "/api/v2" as const;
const PORT: number = Number(process.env.ANIWATCH_API_PORT) || 4000;
const ANIWATCH_API_HOSTNAME = process.env?.ANIWATCH_API_HOSTNAME;

const app = new Hono<{ Variables: AniwatchAPIVariables }>();

app.use(logger());

// ✅ التحقق من أن الطلب قادم من موقعك فقط
app.use("*", async (c, next) => {
  const allowedOrigin = "https://mhmod3.github.io/IIIAnime/";
  const origin = c.req.header("origin") || c.req.header("referer");

  if (!origin || !origin.startsWith(allowedOrigin)) {
    return c.json({ error: "🚫 Access Denied: Unauthorized origin." }, 403);
  }

  c.header("Access-Control-Allow-Origin", "https://mhmod3.github.io");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");

  if (c.req.method === "OPTIONS") {
    return c.body(null, 200);
  }

  await next();
});

app.use(corsConfig);
app.use(cacheControlMiddleware);

// حماية إضافية للحالات التي ليست للنشر الشخصي
const ISNT_PERSONAL_DEPLOYMENT = Boolean(ANIWATCH_API_HOSTNAME);
if (ISNT_PERSONAL_DEPLOYMENT) {
  app.use(ratelimit);
}

app.use("/", serveStatic({ root: "public" }));
app.get("/health", (c) => c.text("daijoubu", { status: 200 }));
app.get("/v", async (c) =>
  c.text(
    `v${"version" in pkgJson && pkgJson?.version ? pkgJson.version : "-1"}`
  )
);

app.use(cacheConfigSetter(BASE_PATH.length));

app.basePath(BASE_PATH).route("/hianime", hianimeRouter);
app
  .basePath(BASE_PATH)
  .get("/anicrush", (c) => c.text("Anicrush could be implemented in future."));

app.notFound(notFoundHandler);
app.onError(errorHandler);

// للتشغيل المحلي (ليس Vercel)
if (!Boolean(process.env?.ANIWATCH_API_VERCEL_DEPLOYMENT)) {
  serve({
    port: PORT,
    fetch: app.fetch,
  }).addListener("listening", () =>
    console.info(
      "\x1b[1;36m" + `aniwatch-api at http://localhost:${PORT}` + "\x1b[0m"
    )
  );

  if (ISNT_PERSONAL_DEPLOYMENT) {
    const interval = 9 * 60 * 1000; // 9mins
    setInterval(() => {
      console.log("aniwatch-api HEALTH_CHECK at", new Date().toISOString());
      https
        .get(`https://${ANIWATCH_API_HOSTNAME}/health`)
        .on("error", (err) => {
          console.error(err.message);
        });
    }, interval);
  }
}

export default app;
