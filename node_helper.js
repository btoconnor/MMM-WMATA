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
        Log.info(`notification pre ${notification}`);

        switch (notification) {
            case "WMATA_INIT":
                this.apiKey = payload.apiKey;

                this.initComplete(payload);
                break;
            case "WMATA_TRAIN_TIMES_GET":
                this.getTrainTimes(payload);
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
            ...{'Min': this.normalizeTrainMinutes(data['Min']) }
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

});
