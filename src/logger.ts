/* eslint-disable @typescript-eslint/no-explicit-any */
import { createLogger, format, transports } from "winston";

const combinedLogger = createLogger({
    level: "info",
    exitOnError: false,
    format: format.combine(format.timestamp(), format.json()),
    transports: [new transports.File({ filename: `./logs/combined.log` })],
});

const errorLogger = createLogger({
    level: "error",
    exitOnError: false,
    format: format.combine(format.timestamp(), format.json()),
    transports: [new transports.File({ filename: `./logs/error.log` })],
});

const consoleLogFormat = format.printf((info) => {
    const log = `${info.timestamp} | ${info.level.toUpperCase()} | ${info.message}`;

    return info.stack ? `${log}\n${info.stack}` : log;
});

const consoleLogger = createLogger({
    level: "debug",
    exitOnError: false,
    format: format.combine(format.errors({ stack: true }), format.timestamp(), consoleLogFormat),
    transports: [new transports.Console()],
});

export class dLogger {
    static info(name: string, msg: any): void {
        consoleLogger.info(`${name}: ${msg}`);
        if (typeof msg === "object") msg = msg.toString();
        combinedLogger.info(`${name}: ${msg}`, { color: "blue" });
    }
    static error(name: string, msg: any): void {
        consoleLogger.error(`${name}: ${msg}`);
        if (typeof msg === "object") msg = msg.toString();
        combinedLogger.error(`${name}: ${msg}`, { color: "red" });
        errorLogger.error(`${name}: ${msg}`, { color: "red" });
    }
    static warn(name: string, msg: any) {
        consoleLogger.warn(`${name}: ${msg}`);
        if (typeof msg === "object") msg = msg.toString();
        combinedLogger.warn(`${name}: ${msg}`, { color: "orange" });
    }
    static debug(name: string, msg: any): void {
        consoleLogger.debug(`${name}: ${msg}`);
    }
}
