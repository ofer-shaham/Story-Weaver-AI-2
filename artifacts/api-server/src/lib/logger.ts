import pino from "pino";
import path from "path";
import fs from "fs";

const logLevel = "debug";
const isProduction = process.env.NODE_ENV === "production";

const logsDir = path.resolve(process.cwd(), "logs");
fs.mkdirSync(logsDir, { recursive: true });
const serverLogPath = path.join(logsDir, "server.log");

const devTransport = {
  targets: [
    {
      target: "pino-pretty",
      options: { colorize: true, destination: 1 },
      level: process.env.LOG_LEVEL ?? logLevel,
    },
    {
      target: "pino/file",
      options: { destination: serverLogPath },
      level: process.env.LOG_LEVEL ?? logLevel,
    },
  ],
};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? logLevel,
  redact: [
    // "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction ? {} : { transport: devTransport }),
});
