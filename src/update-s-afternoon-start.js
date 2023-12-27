import readline from "readline/promises";
import clipboardy from "clipboardy";
import hourConvert from "hour-convert";
import { exit, makeSenderReceiver, restartTimeout, suspendTimeout } from "./util.js";

let timeTriggerDataSent = null;

export async function updateSDayPhaseStart(homee, prefs) {
    if (
        ! Number.isSafeInteger(prefs.sDayPhaseHomeegramId) ||
        ! Number.isFinite(prefs.averageSleepHoursPerSDay) ||
        prefs.averageSleepHoursPerSDay < 0 ||
        prefs.averageSleepHoursPerSDay > 24 ||
        ! Number.isFinite(prefs.wakeTimeToSDayPhaseHours) ||
        prefs.wakeTimeToSDayPhaseHours < 0 ||
        prefs.wakeTimeToSDayPhaseHours > 24 ||
        ! Number.isFinite(prefs.averageSleepDeviationWeight) ||
        prefs.averageSleepDeviationWeight < 0 ||
        prefs.averageSleepDeviationWeight > 1
    ) {
        await exit(prefs, "One or more required entries in config file missing or having incorrect values.");
    }

    const [ doneSender, doneReceiver ] = makeSenderReceiver();

    homee.on("message", (message) => onHomeeMessage(homee, message, prefs, doneSender));

    homee.connect().then(() => {
        console.log("Connected to Homee.");
    }).catch(async (error) => {
        await exit(prefs, `Couldn't connect to Homee.\n${error}`);
    });

    await doneReceiver;
}

async function onHomeeMessage(homee, message, prefs, doneSender) {
    // After initial automatic `GET:all` command.
    if (message.all != null) {
        const timeTriggerId = (
            message
                .all
                .homeegrams
                ?.find((homeegram) => homeegram.id === prefs.sDayPhaseHomeegramId)
                ?.triggers
                ?.time_triggers
                ?.find((timeTrigger) => timeTrigger.homeegram_id === prefs.sDayPhaseHomeegramId)
                ?.id
        );

        if (timeTriggerId == null) {
            await exit(prefs, "Couldn't determine time trigger ID in answer to `GET:all` command. Does the homeegram and a time trigger for it exist?");
        }

        suspendTimeout();
        timeTriggerDataSent = await updateTimeTrigger(homee, prefs, timeTriggerId);
        restartTimeout(prefs);
    }

    // After updating time trigger.
    else if (
        timeTriggerDataSent != null &&
        message.homeegram?.id === prefs.sDayPhaseHomeegramId
    ) {
        const newTimeTrigger = (
            message
                .homeegram
                .triggers
                ?.time_triggers
                ?.find((timeTrigger) => (
                    timeTrigger.homeegram_id === prefs.sDayPhaseHomeegramId &&
                    timeTrigger.id === timeTriggerDataSent.id
                ))
        );

        if (
            newTimeTrigger?.dtstart === timeTriggerDataSent.dtstart &&
            newTimeTrigger?.rrule === timeTriggerDataSent.rrule
        ) {
            console.log("Received confimation about time trigger update from Homee.");
            doneSender();
        } else {
            await exit(prefs, "Homee failed to update time trigger.");
        }
    }
}

async function updateTimeTrigger(homee, prefs, timeTriggerId) {
    // Receive sleep start and end time.
    let inputText;
    if (prefs.clipboard) {  // By clipboard.
        try {
            inputText = await clipboardy.read();
        } catch (error) {
            await exit(prefs, error);
        }
    } else {  // By user input.
        const readlineInterface = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        try {
            inputText = await readlineInterface.question("Enter both sleep start and end time in format \"hour:minute[am|pm]\" (may be embedded in other text): ");
            readlineInterface.close();
        } catch (error) {
            await exit(prefs, error);
        }

        if (! homee.connected) {
            await exit(prefs, "Connection to Homee lost. Try again quicker.");
        }
    }

    const matches = [ ...inputText.matchAll(/(?<![\w:])(\d{1,2}):(\d{1,2})(am|pm)?(?![\w:])/ig) ];
    if (matches.length !== 2) {
        await exit(prefs, `Couldn't find exactly two clock times in the ${prefs.clipboard ? "clipboard" : "input"}.`);
    }

    const times = [ ];
    for (const match of matches) {
        const hour = Number(match[1]);
        const minute = Number(match[2]);
        const meridiem = match[3]?.toLowerCase();

        if (
            (meridiem == null && hour > 23) ||
            (meridiem != null && (hour < 1 || hour > 12)) ||
            (minute > 59)
        ) {
            await exit(prefs, "Invalid clock time.");
        }

        times.push({
            hour: meridiem == null
                ? hour
                : hourConvert.to24Hour({ hour, meridiem }),
            minute,
        });
    }

    console.log(`Using sleep start ${matches[0][0]} and end ${matches[1][0]}${prefs.clipboard ? " from clipboard" : ""}.`);

    // Calculate the s.-day phase start.
    const sleepStartHour = times[0].hour + times[0].minute / 60;
    const sleepEndHour = times[1].hour + times[1].minute / 60;
    const sleepHours = (sleepEndHour - sleepStartHour + 24) % 24;

    const FIVE_MINUTES_IN_HOURS = 5 /*min*/ / 60;
    const sDayPhaseDelayHours = (sleepHours - prefs.averageSleepHoursPerSDay) * prefs.averageSleepDeviationWeight;  // Short sleep: earlier. Long sleep: later.
    const sDayPhaseStartHour = (
        (
            Math.round(
                (sleepEndHour + prefs.wakeTimeToSDayPhaseHours + sDayPhaseDelayHours)
                / FIVE_MINUTES_IN_HOURS
            ) * FIVE_MINUTES_IN_HOURS  // Rounded to 5-minute accuracy, because Homee's web app also only allows 5-minute steps.
            + 2 * 24  // Prevent negative values.
        ) % 24
    );

    // Build Homee parameters.
    const oneDayAgo = new Date(Date.now() - 24 /*h*/ * 60 * 60 * 1000);
    const timezoneOffset = -oneDayAgo.getTimezoneOffset() /*min*/ * 60 * 1000;
    const localRuleStartPassedOffAsUTC = new Date(oneDayAgo.getTime() + timezoneOffset);

    const triggerHourString = Math.floor(sDayPhaseStartHour).toString();  // Only hour value without fractional part.
    const triggerMinuteString = Math.round(sDayPhaseStartHour % 1 * 60).toString();
    const repetitionRule = [
        [ "FREQ", "DAILY" ],
        [ "INTERVAL", "1" ],
        [ "BYHOUR", triggerHourString ],
        [ "BYMINUTE", triggerMinuteString ],
        [ "BYSECOND", "0" ],
    ];

    const timeTriggerDataSent = {
        id: timeTriggerId,
        dtstart: localRuleStartPassedOffAsUTC.toISOString().replaceAll(/-|:|\.\d+/g, ""),  // Alledged UTC required by Homee or a bug in the official web app?
        rrule: (
            repetitionRule
                .map(keyValuePair => keyValuePair.join("="))
                .join(";")
        ),
    };

    // Apply time trigger to Homee.
    homee.send(`PUT:homeegrams/${prefs.sDayPhaseHomeegramId}/triggers/${timeTriggerId}?dtstart=${timeTriggerDataSent.dtstart}&rrule=${encodeURIComponent(timeTriggerDataSent.rrule)}`);
    console.log(`Requested Homee to update homeegram's time trigger to ${triggerHourString.padStart(2, "0")}:${triggerMinuteString.padStart(2, "0")}.`);

    return timeTriggerDataSent;
}
