import app from "./app";
import { logger } from "./lib/logger";
import { runDbInit, runSeed } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const isProduction = process.env["NODE_ENV"] === "production";

async function startup(): Promise<void> {
  try {
    await runDbInit();
  } catch (initErr: unknown) {
    if (isProduction) {
      logger.error(
        { err: initErr },
        "DB init failed in production — aborting startup",
      );
      throw initErr;
    }
    logger.error({ err: initErr }, "DB init failed (non-fatal in dev)");
  }

  try {
    await runSeed();
  } catch (seedErr: unknown) {
    if (isProduction) {
      logger.error(
        { err: seedErr },
        "Seed failed in production — aborting startup",
      );
      throw seedErr;
    }
    logger.error({ err: seedErr }, "Seed failed (non-fatal in dev)");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

startup().catch((err: unknown) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
