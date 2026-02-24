import log from "electron-log/main.js";

// Route main-process console.* calls through electron-log so they land in the file
Object.assign(console, log.functions);

// File transport: info+ written to ~/Library/Logs/<appName>/main.log
log.transports.file.level = "info";
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB

// Console transport: all levels in dev, warn+ in production
log.transports.console.level = process.env.NODE_ENV === "development" ? "debug" : "warn";

export default log;
