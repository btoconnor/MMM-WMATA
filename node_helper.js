const NodeHelper = require('node_helper');
const Log = require("logger");

module.exports = NodeHelper.create({
    start() {
        Log.info(`Starting module: ${this.name} with identifier: ${this.identifier}`);

        this.apiKey = null;

        this.outstandingTrainTimeRequest = false;
        this.outstandingBusTimeRequest = false;
        this.outstandingTrainIncidentRequest = false;
        this.outstandingBusIncidentRequest = false;
    },

    socketNotificationReceived(notification, payload) {
        switch (notification) {
            case "WMATA_INIT":
                this.apiKey = payload.apiKey;

                this.initComplete(payload);
                break;
            case "WMATA_TRAIN_TIMES_GET":
                this.getTrainTimes(payload);
                break;

            case "WMATA_BUS_TIMES_GET":
                this.getBusTimes(payload);
                break;

            case "WMATA_TRAIN_INCIDENTS_GET":
                this.getTrainIncidents(payload);
                break;

            case "WMATA_BUS_INCIDENTS_GET":
                this.getBusIncidents(payload);
                break;
        }

    },

    initComplete(payload) {
        this.sendSocketNotification("WMATA_INITIALIZED", {
            identifier: payload.identifier
        });
    },

    getTrainTimes(payload) {
        const trainQuery = payload.stations.join(",");

        const url = `https://api.wmata.com/StationPrediction.svc/json/GetPrediction/${trainQuery}`;

        // TODO: Error handling
        fetch(url, {
            method: "GET",
            headers: {
                "api_key": this.apiKey,
            }
        })
            .then((response) => {
                return response.json();
            })
            .then((data) => {
                const trainDataRaw = data['Trains'];

                const trainDataFormatted = trainDataRaw.map((trainData) => this.formatTrainData(trainData));
                this.sendSocketNotification("WMATA_TRAIN_TIMES_DATA", {
                    identifier: payload.identifier,
                    trainData: trainDataFormatted,
                });
            })
        ;
    },

    formatTrainData(data) {
        return {
            ...data,
            ...{'MinNumber': this.normalizeTrainMinutes(data['Min']) }
        };
    },

    normalizeTrainMinutes(value) {
        if (value === 'BRD' || value === 'ARR') {
            return 0;
        } else if (value === "---" || value === null) {
            return -1;
        } else {
            return parseInt(value);
        }
    },

    getBusTimes(payload) {
        console.debug(payload.busStops);
        const busPredictions = {};

        const busFetches = payload.busStops.map(stopID => this.getBusStopPrediction(stopID));

        Promise.all(busFetches)
            .then(responses => {
                responses.map((r) => {
                    busPredictions[r.stopID] = r;
                });
            })
            .then(() => {
                console.debug(busPredictions);
            })
            .then(() => {
                this.sendSocketNotification("WMATA_BUS_TIMES_DATA", {
                    identifier: payload.identifier,
                    busPredictions
                });
            });
    },

    getBusStopPrediction(stopID) {
        const url = `https://api.wmata.com/NextBusService.svc/json/jPredictions?StopID=${stopID}`;

        return fetch(url, {
            method: "GET",
            headers: {
                "api_key": this.apiKey,
            }
        })
            .then((response) => {
                return response.json();
            })
            .then((data) => {
                const stopPredictions = data['Predictions'];

                return { stopID: stopID,
                         predictions: stopPredictions,
                         locationName: data['StopName']};
            });

    },

    getTrainIncidents(payload) {
        const url = "https://api.wmata.com/Incidents.svc/json/Incidents";
        console.log("Fetching train updates");
        fetch(url, {
            method: "GET",
            headers: {
                "api_key": this.apiKey,
            }
        })
            .then((response) => {
                return response.json();
            })
            .then((data) => {
                const incidents = data['Incidents'];

                const trainAlerts = new Set();
                const trainDelays = new Set();

                incidents
                    .filter((incident) => { return incident['IncidentType'] === 'Alert'; })
                    .map((incident) => {
                        console.log(`split from ${incident['LinesAffected']} is ${incident['LinesAffected'].split("; ")}`);
                        return incident['LinesAffected']
                            .split(";")
                            .map((line) => line.trim())
                            .filter((line) => line !== '');
                    })
                    .forEach((incidentLine) => {
                        trainAlerts.add(...incidentLine);
                    });

                incidents
                    .filter((incident) => incident['IncidentType'] === 'Delay')
                    .map((incident) => {
                        return incident['LinesAffected']
                            .split(";")
                            .map((line) => line.trim())
                            .filter((line) => line !== '');
                    })
                    .forEach((incidentLine) => {
                        trainDelays.add(...incidentLine);
                    });

                // TODO: WMATA claims that the incidents are *usually* either Alert or Delay, but it's subject to
                // change at any time.  It's probably worth doing a filter for incidents that are not alert / delay and
                // pass them back to the frontend.

                this.sendSocketNotification("WMATA_TRAIN_INCIDENTS_DATA", {
                    identifier: payload.identifier,
                    trainAlerts: Array.from(trainAlerts),
                    trainDelays: Array.from(trainDelays)
                });
            });
    },

    getBusIncidents(payload) {
        console.log("Getting bus incidents");
        const url = "https://api.wmata.com/Incidents.svc/json/BusIncidents";

        fetch(url, {
            method: "GET",
            headers: {
                "api_key": this.apiKey,
            }
        })
            .then((response) => {
                return response.json();
            })
            .then((data) => {
                const incidents = data['BusIncidents'];

                if (payload.busIncidentRoutes !== null) {
                    incidents.filter((incident) => {
                        for (const routeAffected of incident['RoutesAffected']) {
                            if (payload.busIncidents.includes(routeAffected)) {
                                return true;
                            }
                        }

                        return false;
                    });
                }

                const busAlerts = new Set();
                const busDelays = new Set();

                console.debug(incidents);

                incidents
                    .filter((incident) => incident['IncidentType'] === 'Delay')
                    .forEach((incident) => {
                        busDelays.add(...incident['RoutesAffected']);
                    });

                incidents
                    .filter((incident) => incident['IncidentType'] === 'Alert')
                    .map((incident) => incident['RoutesAffected'])
                    .forEach((incidentRoutes) => {
                        console.debug(incidentRoutes);
                        busAlerts.add(...incidentRoutes);
                    });

                // TODO: WMATA claims that the incidents are *usually* either Alert or Delay, but it's subject to
                // change at any time.  It's probably worth doing a filter for incidents that are not alert / delay and
                // pass them back to the frontend.
                console.log("bus incidents");
                console.debug(busAlerts);
                console.debug(busDelays);

                this.sendSocketNotification("WMATA_BUS_INCIDENTS_DATA", {
                    identifier: payload.identifier,
                    busAlerts: Array.from(busAlerts),
                    busDelays: Array.from(busDelays),
                });
            });
    },

});
