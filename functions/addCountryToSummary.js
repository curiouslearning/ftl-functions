const functions = require('firebase-functions');
const admin = require('firebase-admin');
const isEmpty = require('lodash/isEmpty');

if (admin.apps.length === 0) {
  admin.initializeApp();
}

//TODO - Add error handling for retrieving the aggregate_data document
exports.addCountryToSummary = functions.firestore
    .document('loc_ref/{documentId}')
    .onCreate(async (snap, context)=>{
        const country = snap.data().country;
        let regions = snap.data().regions;
        let regionCounts = [];
        let countrySum = 0;
        regions.forEach((region)=>{
            if (region.hasOwnProperty('learnerCount') && region.learnerCount >=0) {
                regionCounts.push({
                    region: region.region,
                    learnerCount: region.learnerCount,
                });
                countrySum += region.learnerCount;
            }
        });
        let summary = admin.firestore().collection('aggregate_data')
            .doc('RegionSummary');

        return summary.get().then((doc)=>{
            let countries = doc.data().countries;

            if(isEmpty(countries.find(c => c.country === country))) {
                countries.push({
                    country: country,
                    learnerCount: countrySum,
                    regions: regionCounts,
                });
            }

            return countries;
        }).then((countries)=>{  //Should not be .then.  The result from the previous method is not returning a promise
            return summary.update({countries: countries});
        }).catch((err)=>{
            console.error(err);
        });
    });
