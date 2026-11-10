import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV } from "./_core/env.js";
import { registerStorageProxy } from "./_core/storageProxy.js";
import { getDb, mongoStatus } from "./core/database.js";
import { asyncHandler, errorHandler, notFoundHandler } from "./core/http.js";
import { authRouter } from "./routes/auth.js";
import { googleOAuthRouter } from "./routes/googleOAuth.js";
import { intelligenceRouter } from "./routes/intelligence.js";
import { operationsRouter } from "./routes/operations.js";
import { monitorRouter } from "./routes/monitor.js";
import { peopleRouter } from "./routes/people.js";
import { portalRouter } from "./routes/portal.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: ENV.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);

  app.get(
    "/api/health",
    asyncHandler(async (_req, res) => {
      await getDb();
      res.json({
        status: "healthy",
        storage: mongoStatus(),
        platform: "BUSSOLOGIC",
        version: "1.0.0",
        capabilities: [
          "predictive_risk_radar",
          "capacity_intelligence",
          "decision_simulator",
          "recommendation_engine",
          "business_copilot",
          "outcome_learning",
          "workflow_builder",
          "governance_audit",
        ],
      });
    })
  );

  app.use("/auth/google", googleOAuthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api", operationsRouter);
  app.use("/api", peopleRouter);
  app.use("/api", monitorRouter);
  app.use("/api", portalRouter); // must precede intelligenceRouter (manager-only for all remaining routes)
  app.use("/api", intelligenceRouter);
  app.use("/api", notFoundHandler);

  // Production: serve the built React client (npm run build -> dist/public).
  const distPath = path.join(projectRoot, "dist", "public");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (_req, res) =>
      res.sendFile(path.join(distPath, "index.html"))
    );
  } else {
    app.get("/", (_req, res) =>
      res.json({ name: "BUSSOLOGIC API", health: "/api/health" })
    );
  }

  app.use(errorHandler);
  return app;
}
