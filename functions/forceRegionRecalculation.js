const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const config = require('../config/functionConfig')
const helpers = require('./helpers/firebaseHelpers');
const { BatchManager } = require('./batchManager');

exports.forceRegionRecalculation = functions.https.onRequest(async (req, res)=> {
    const batchManager = new BatchManager();
    const locRef = admin.firestore().collection('loc_ref');
    try {
        snap = await locRef.get();
        for (const doc of snap) {
            let id = doc.id;
            let data = doc.data();
            let countrySum = 0;
            let index = 0;
            for (const region of data.regions) {
                try {
                    data.regions[index].learnerCount = await helpers.updateCountForRegion(data.country, region.region);
                    countrySum += data.regions[index].learnerCount;
                } catch (err) {
                    console.error(`Error when updating count for region: ${region.region}`);
                    throw err;
                }
            }
            data.learnerCount = countrySum;
            batchManager.set(locRef.doc(id), data, {merge: true});
        }
        try {
            await batchManager.commit();
        } catch (err) {
            console.error(`Error when trying to commit the batches: ${err}`);
            throw err;
        }
        res.status(200).end();
    } catch(err) {
        console.error(err);
        res.status(501).end();
    }
});
