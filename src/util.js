import url from "url";
import path from "path";
import fs from "fs/promises";
import pause from "node-pause";

export const npmPackage = JSON.parse(await fs.readFile(
    path.join(
        path.dirname(url.fileURLToPath(import.meta.url)),
        "../package.json",
    ),
    { encoding: "utf8" },
));

let timeoutId = null;

export function restartTimeout(prefs) {
    if (timeoutId != null) {
        clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(async () => {
        await exit(prefs, "Timeout duration elapsed before getting expected response from Homee.");
    }, prefs.timeoutMillis);
}

export function suspendTimeout() {
    clearTimeout(timeoutId);
}

export function makeSenderReceiver() {
    let sender;
    const receiver = new Promise((resolve) => {
        sender = resolve;
    });

    return [ sender, receiver ];
}

export async function exit(prefs, errorMessage = null) {
    if (timeoutId != null) {
        clearTimeout(timeoutId);
    }

    if (errorMessage != null) {
        console.error(errorMessage);
    }

    if (prefs.wait || (errorMessage != null && prefs.waitOnError)) {
        await pause("Press any key...");
    }

    process.exit(errorMessage == null ? 0 : 1);
}
