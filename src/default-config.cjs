module.exports = {
    // General settings.
    homeeHostNameOrIP: "homee",

    // Settings for command `update-s-day-phase-start`.
    sDayPhaseHomeegramId: 13,  // See homeegram's URL.
    averageSleepHoursPerSDay: 8 /*h*/ + 25 /*min*/ / 60,  // To be calculated based on sleep log.
    wakeTimeToSDayPhaseHours: 8 /*h*/ + 0 /*min*/ / 60,
    averageSleepDeviationWeight: 0.4,  // S.-day phase earlier/later, based on last sleep's deviation from average sleep, to *what* extent?
};
