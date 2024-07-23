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
        busUpdateInterval: 60,
        showEmptyBusStops: true,
        busStopFilterFn: (_datetime, _stationCode) => true,

        showBusIncidents: true,
        busIncidentUpdateInterval: 120,
    },

    /**
     * Core method, called when all modules are loaded and the system is ready to boot up.
     */
    start() {
        this.apiKey = null;
        this.initialized = false;

        this.trainUpdateInterval = 0;
        this.busUpdateInterval = 0;

        this.trainTimesLastUpdatedTimestamp = null;
        this.trainTimesLastUpdatedFormatted = null;

        this.busTimesLastUpdatedTimestamp = null;
        this.busTimesLastUpdatedFormatted = null;

        this.formattedTrainData = null;
        this.formattedBusData = null;
        this.activeBusStops = [];

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
                    this.trainTimesLastUpdatedTimestamp = now.format("x");
                    this.trainTimesLastUpdatedFormatted = now.format("MMM D - h:mm:ss a");

                    this.formattedTrainData = this.formatTrains(payload.trainData);

                    this.updateDom();

                    break;
                case "WMATA_BUS_TIMES_DATA":
                    console.log(`received data ${payload.busPredictions}`);
                    console.debug(payload.busPredictions);

                    this.busTimesLastUpdatedTimestamp = now.format("x");
                    this.busTimesLastUpdatedFormatted = now.format("MMM D - h:mm:ss a");
                    this.activeBusStops = Object.keys(payload.busPredictions).filter((stopID) => {
                        return payload.busPredictions[stopID].predictions.length > 0;
                    });

                    console.log("active stops");
                    console.debug(this.activeBusStops);

                    this.formattedBusData = this.formatBuses(payload.busPredictions);

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
            trainsLastUpdated: this.trainTimesLastUpdatedFormatted,

            buses: this.formattedBusData,
            busesLastUpdated: this.busTimesLastUpdatedFormatted,
            showEmptyBusStops: this.config.showEmptyBusStops,
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

        if (this.config.busStops.length > 0) {
            this.startBusTimeFetchingLoop(this.config.busUpdateInterval);
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

    startBusTimeFetchingLoop(busUpdateInterval) {
        Log.info("Starting fetching loop for bus predictions");
        this.getBusTimes();

        if (this.busUpdateInterval === 0) {
            this.busUpdateInterval = setInterval(() => {
                this.getBusTimes();
            }, busUpdateInterval * 1000);
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

    getBusTimes() {
        Log.info("Fetching bus predictions...");

        this.sendSocketNotification("WMATA_BUS_TIMES_GET", {
            identifier: this.identifier,
            apiKey: this.config.apiKey,
            busStops: this.config.busStops.filter((stop) => {
                // If we're actively tracking buses, we'll always include this
                // station in the update.
                if (this.activeBusStops.includes(stop)) {
                    return true;
                }

                return this.config.busStopFilterFn(new Date(), stop);
            })
        });
    },

    formatTrains(trains) {
        const formattedMap = Map.groupBy(
            trains,
            ({ LocationName }) => LocationName
        );

        const formatted = [];

        for (let [location, trains] of formattedMap) {
            const locationFormatted = {
                locationName: location,
                trains: trains.map((train) => {
                    return {
                        line: train['Line'],
                        minutes: train['MinNumber'],
                        destination: train['DestinationName'] || train['Destination'],
                        location: train['LocationName']
                    }
                })
            }

            formatted.push(locationFormatted);
        }

        return formatted;
    },

    formatBuses(busPredictions) {
        const formatted = [];

        for (let [busStopID, stopInfo] of Object.entries(busPredictions)) {
            const locationFormatted = {
                locationName: stopInfo['locationName'],
                buses: stopInfo['predictions'],
            }

            formatted.push(locationFormatted);
        }

        return formatted;
    },
});
