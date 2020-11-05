const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

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
            //TODO - validate that the country is not already present in the list
            countries.push({
                country: country,
                learnerCount: countrySum,
                regions: regionCounts,
            });
            return countries;
        }).then((countries)=>{  //Should not be .then.  The result from the previous method is not returning a promise
            return summary.update({countries: countries});
        }).catch((err)=>{
            console.error(err);
        });
    });
