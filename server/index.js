import { createServer } from "node:http";
import { ENV } from "./_core/env.js";
import { createApp } from "./app.js";
import { closeDb, ensureSeed, getDb } from "./core/database.js";
import { getMlMetrics } from "./ml/pipeline.js";
import { backfillAssigneeIds } from "./routes/portal.js";

async function start() {
  console.log("Initializing BUSSOLOGIC Operations Intelligence Platform...");
  try {
    await getDb();
    await ensureSeed();
    await backfillAssigneeIds();
  } catch (error) {
    console.warn("Database startup notice:", error.message);
  }
  try {
    console.log(
      `Operational ML pipeline initialized: F1 score ${getMlMetrics().f1Score}%`
    );
  } catch (error) {
    console.warn("ML initialization notice:", error.message);
  }

  const server = createServer(createApp());
  server.listen(ENV.port, ENV.host, () =>
    console.log(`BUSSOLOGIC API running on http://localhost:${ENV.port}`)
  );

  const shutdown = async () => {
    console.log("Shutting down BUSSOLOGIC.");
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
