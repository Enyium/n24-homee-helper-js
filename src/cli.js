#!/usr/bin/env node

import { program } from "commander";
import { stripIndent } from "proper-tags";
import Homee from "homee-api";
import { configFileDisplayPath, loadConfig } from "./config.js";
import { dumpRunningHomeegrams } from "./dump-running-homeegrams.js";
import { updateSDayPhaseStart } from "./update-s-day-phase-start.js";
import { restartTimeout, exit, npmPackage } from "./util.js";

program
    .name(npmPackage.name)
    // `-u` and `-p` are deliberately shortened, so malware has a harder time harvesting credentials.
    .option("-u <username>", "Homee username")
    .option("-p <password>", "Homee password")
    .option("-t, --timeout <seconds>", "Seconds until an interaction with Homee is aborted when not getting the expected response", 10)
    .option("-w, --wait", "Wait until key press after finishing")
    .option("-W, --wait-on-error", "Wait until key press in case of a non-command-line-related error")
    .version(npmPackage.version)
    .addHelpText("after", stripIndent`

        Adjust other settings in "${configFileDisplayPath}". Run any command to first create the config file.
    `);

let commandName = null;
let prefs = { };
const makeAction = (name) => {
    return (options) => {
        commandName = name;
        Object.assign(prefs, options);
    };
};

program.command("dump-running-homeegrams")
    .summary("Dump JSON about homeegrams currently running")
    .description("Prints a JSON array to stdout containing the IDs of homeegrams that are currently running, along with their start timestamps. This, e.g., allows other software to check what s.-day phase currently applies. Example output: `[ { \"id\": 0, \"start_epoch_secs\": 1704067200 } ]`.")
    .action(makeAction("dump-running-homeegrams"));

program.command("update-s-day-phase-start")
    .summary("Define start time of time-triggered homeegram based on sleep times")
    .description("Prompts for text or reads clipboard. The text is searched for two occurrences of clock times in the format `hour:minute` with possible `am` or `pm` suffix. The times are interpreted as the start and end time of the last sleep. From these times, the start of a certain s.-day phase (s. afternoon or s. evening) is calculated, and an existing time trigger of the s.-day phase homeegram is redefined to adhere to the new start time. It's recommended to create a shortcut to this command and run it every s. morning.")
    .option("-c, --clipboard", "Read text from clipboard instead of waiting for input")
    .action(makeAction("update-s-day-phase-start"));

program.parse();
Object.assign(prefs, program.opts(), await loadConfig());

// Verify existence of required args.
if (prefs.u == null || prefs.p == null) {
    console.error("-u or -p missing.");
    process.exit(1);
}

// Transform and verify arg data types.
prefs.timeout = Number(prefs.timeout);
if (!Number.isSafeInteger(prefs.timeout)) {
    console.error("Incorrect timeout.");
    process.exit(1);
}

// Improve args.
prefs.username = prefs.u;
prefs.password = prefs.p;
prefs.timeoutMillis = prefs.timeout * 1000;

// Process command.
try {
    const homee = new Homee(prefs.homeeHostNameOrIP, prefs.username, prefs.password, {
        device: npmPackage.name,
        reconnect: false,
    });

    restartTimeout(prefs);

    switch (commandName) {
    case "dump-running-homeegrams":
        await dumpRunningHomeegrams(homee, prefs);
        break;
    case "update-s-day-phase-start":
        await updateSDayPhaseStart(homee, prefs);
        break;
    }
} catch (error) {
    await exit(prefs, error);
}

await exit(prefs);
