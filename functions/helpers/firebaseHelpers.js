const admin = require('firebase-admin');
const {Client, Status} = require('@googlemaps/google-maps-services-js');
const gmaps = new Client({});

if (admin.apps.length === 0) {
  admin.initializeApp();
}
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

const updateCountForCampaign = (campaignID) => {
  let dbRef = admin.firestore().collection('campaigns');
  return dbRef.where('campaignID', '==', campaignID).get().then((snap)=>{
    if (snap.empty) {
      throw new Error('could not find campaign with id: ', campaignID);
    }
    const doc = snap.docs[0];
    let count = doc.data().learnerCount + 1;
    return doc.ref.update({learnerCount: count}).catch((err)=>{
      console.error(err);
    });
  }).catch((err)=>{
    console.error(err);
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

function getCostPerLearner(campaignID) {
  return admin.firestore().collection('campaigns')
      .where('campaignID', '==', campaignID)
      .get().then((snap)=>{
        if (snap.empty) {
          throw new Error('can\'t find campaign with ID: ', campaignID);
        }
        return snap.docs[0].data().costPerLearner;
      }).catch((err)=>{
        console.error(err);
      });
}

function getDonorID(email) {
  return admin.auth().getUserByEmail(email)
      .then((user)=>{
        return user.uid;
      }).catch((err)=>{
        if (err.code === 'auth/user-not-found') {
          console.log('No Donor found for email: ', email);
          return '';
        } else throw new Error(err);
      });
}

function getDonation(donorID, donationID) {
  return admin.firestore().collection('donor_master').doc(donorID)
      .collection('donations').doc(donationID)
      .get().then((doc)=>{
        if (!doc.exists) {
          throw new Error(
              donorID,
              ' is missing Donation Document: ',
              donationID,
          );
        }
        return {id: doc.id, data: doc.data()};
      }).catch((err)=>{
        console.error(err);
      });
}

function findObjWithProperty(arr, prop, val) {
  for (let i=0; i < arr.length; i++) {
    if (arr[i].hasOwnProperty(prop) && arr[i][prop] === val) {
      return i;
    }
  }
  return -1;
}
function updateMasterLearnerCount(country) {
  const msgRef = admin.firestore().collection('aggregate_data').doc('data');
  return msgRef.get().then((doc)=>{
    let count = doc.data().allLearnersCount + 1;
    let noCountry = doc.data().allLearnersWithDoNotTrack;
    if (country === 'no-country') {
      noCountry++;
    }
    return msgRef.update({
      allLearnersCount: count,
      allLearnersWithDoNotTrack: noCountry,
    });
  }).catch((err)=>{
    console.error(err);
  });
}


module.exports = {
  getPinForAddress,
  updateCountForRegion,
  updateCountForCampaign,
  updateMasterLearnerCount,
  findObjWithProperty,
  getDonation,
  getDonorID,
  getCostPerLearner,
};
