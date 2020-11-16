const admin = require('firebase-admin');
const {Client, Status} = require('@googlemaps/google-maps-services-js');
const gmaps = new Client({});

const getPinForAddress = (address) => {
    let markerLoc = {lat: 0, lng: 0};
    return gmaps.geocode({
        params: {
            address: address,
            key: 'AIzaSyDEl20cTMsc72W_TasuK5PlWYIgMrzyuAU',
        },
        timeout: 1000,
    }).then((r) => {
        if (r.data.results[0]) {
            markerLoc = r.data.results[0].geometry.location;
        }
        return markerLoc;
    }).catch((e) => {
        console.log(e.response.data.error_message);
    });
}

const updateCountForRegion = (country, region) => {
    console.log(country, region);
    if (country === undefined) {
        return new Promise((resolve) => {
            resolve('resolved');
        });
    }
    region === undefined ? 'no-region' : region;

    return admin.firestore().collection('loc_ref').doc(country)
        .get().then((doc) => {
            const data = doc.data();
            const newCount = data.learnerCount + 1;
            let regions = data.regions;
            let foundRegion = false;
            for (const regionIndex in regions) {
                if (regions[regionIndex] && regions[regionIndex].region === region) {
                    foundRegion = true;
                    regions[regionIndex].learnerCount++;
                    if (!regions[regionIndex].hasOwnProperty('pin') ||
                        (regions[regionIndex]['pin'].lat === 0 &&
                            regions[regionIndex]['pin'].lng === 0)) {
                        return getPinForAddress(country + ', ' + region).then((markerLoc) => {
                            regions[regionIndex]['pin'] = {
                                lat: markerLoc.lat,
                                lng: markerLoc.lng,
                            };
                            return doc.ref.set({
                                learnerCount: newCount,
                                regions: regions,
                            }, {merge: true}).catch((err) => {
                                console.error(err);
                            });
                        });
                    }
                }
            }
            if (!foundRegion) {
                return getPinForAddress(country + ', ' + region).then((markerLoc) => {
                    console.log('--------------------- FOUND LOCATION: ' + markerLoc);
                    regions.push({
                        region: region,
                        pin: {
                            lat: markerLoc.lat,
                            lng: markerLoc.lng,
                        },
                        learnerCount: 1,
                        streetViews: {
                            headingValues: [0],
                            locations: [],
                        },
                    });
                    return doc.ref.set({
                        learnerCount: newCount,
                        regions: regions,
                    }, {merge: true}).catch((err) => {
                        console.error(err);
                    });
                });
            }
            doc.ref.set({
                learnerCount: newCount,
                regions: regions,
            }, {merge: true}).catch((err) => {
                console.error(err);
            });
            return newCount;
        }).catch((err) => {
            console.error(err);
        });
}

module.exports = {getPinForAddress, updateCountForRegion};
