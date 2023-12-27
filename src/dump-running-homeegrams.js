import { exit, makeSenderReceiver } from "./util.js";

export async function dumpRunningHomeegrams(homee, prefs) {
    const [ doneSender, doneReceiver ] = makeSenderReceiver();

    homee.on("message", async (message) => {
        // The first message should be the answer to the websocket request `GET:all` that the `homee-api` library initially sends.
        if (message.all != null) {
            const homeegrams = message.all.homeegrams;
            if (homeegrams == null) {
                exit(prefs, "Homee failed to send homeegrams.");
            }

            console.log(JSON.stringify(
                homeegrams
                    .filter((homeegram) => (
                        homeegram.play &&
                        Number.isSafeInteger(homeegram.id) &&
                        Number.isSafeInteger(homeegram.last_triggered)
                    ))
                    .map((homeegram) => ({
                        id: homeegram.id,
                        start_epoch_secs: homeegram.last_triggered,
                    })),
                null,
                "  ",
            ));

            doneSender();
        }
    });

    homee.connect().then(() => {
        // console.error("Connected to Homee.");  // Not so good when used as part of other software.
        // homee.play(123);  // Test by playing homeegram.
    });

    await doneReceiver;
}
