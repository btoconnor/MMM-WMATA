/* global Module, Log, moment */
Module.register("MMM-WMATA", {
    requiresVersion: '2.2.0',

    defaults: {
        apiKey: "",

        trainStations: [],
        trainUpdateInterval: 60,

        showTrainIncidents: true,
        trainIncidentUpdateInterval: 120,

        busStops: [],
        showBusIncidents: true,
        busUpdateInterval: 60,
        busIncidentUpdateInterval: 120,
    },

    /**
     * Core method, called when all modules are loaded and the system is ready to boot up.
     */
    start() {
        this.apiKey = null;
        this.initialized = false;

        this.trainUpdateInterval = 0;

        this.trainTimesLastUpdated = null;

        this.formattedTrainData = null;

        Log.info("WMATA Starting");

        this.sendSocketNotification("WMATA_INIT", {
            identifier: this.identifier,
            apiKey: this.config.wmataApiKey,
            trainStations: this.config.trainStations,
        });
    },

    socketNotificationReceived(notification, payload) {
        if (payload.identifier === this.identifier) {
            const now = moment();

            switch (notification) {
                case "WMATA_INITIALIZED":
                    this.initialized = true;

                    this.startFetchingLoops();
                    break;
                case "WMATA_TRAIN_TIMES_DATA":
                    this.trainTimesLastUpdated = now.format("x");

                    this.formattedTrainData = this.formatTrains(payload.trainData);

                    this.updateDom();

                    break;
            }
        }
    },

    getStyles() {
        return ["MMM-WMATA.css"];
    },

    getTranslations() {
        return {
            en: "translations/en.json"
        };
    },

    getTemplate() {
        return "MMM-WMATA.njk";
    },

    getTemplateData() {
        return {
            loading: false,
            trains: this.formattedTrainData,
        };
    },

    startFetchingLoops() {
        // Need to check what we're fetching among:
        // busses, trains, bus incidents, and train incidents
        // Start immediately ...

        Log.info("Starting WMATA Fetching loops...");

        if (this.config.trainStations.length > 0) {
            this.startTrainTimeFetchingLoop(this.config.trainUpdateInterval);
        }

        // TODO: Start up loops for busses and incidents
    },

    startTrainTimeFetchingLoop(trainUpdateInterval) {
        Log.info("Starting fetching loop for train predictions");
        this.getTrainTimes();

        if (this.trainUpdateInterval === 0) {
            this.trainUpdateInterval = setInterval(() => {
                this.getTrainTimes();
            }, trainUpdateInterval * 1000);
        }
    },

    getTrainTimes() {
        Log.info("Fetching train predictions...");
        this.sendSocketNotification("WMATA_TRAIN_TIMES_GET", {
            identifier: this.identifier,
            apiKey: this.config.apiKey,
            stations: this.config.trainStations,
        });
    },

    formatTrains(trains) {
        // TODO: Group by station
        const formattedMap = Map.groupBy(
            trains,
            ({ LocationName }) => LocationName
        );

        console.debug(trains);

        const formatted = [];

        for (let [location, trains] of formattedMap) {
            const locationFormatted = {
                locationName: location,
                trains: trains.map((train) => {
                    return {
                        line: train['Line'],
                        minutes: train['Min'],
                        destination: train['Destination'],
                        location: train['LocationName']
                    }
                })
            }

            formatted.push(locationFormatted);
        }

        console.log(`formatted is ${formatted}`);
        console.debug(formatted);

        return formatted;
    },
});
