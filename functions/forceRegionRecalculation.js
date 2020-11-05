const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const { config } = require('../config/functionConfig')
require('./helpers/firebaseHelpers');

exports.forceRegionRecalculation = functions.https.onRequest(async (req, res)=>{
    const locRef = admin.firestore().collection('loc_ref');
    const batchMax = 495;
    let batchSize = 0;
    let batchCount = 0;
    let batches = [];
    batches[batchCount] = admin.firestore().batch();
    locRef.get().then(async (snap)=>{
        snap.forEach((doc, i) => {
            if (batchSize >= batchMax) {
                batchSize = 0;
                batchCount++;
                batches[batchCount] = admin.firestore().batch();
            }
            let id = doc.id;
            let data = doc.data();
            let countrySum = 0;
            data.regions.forEach((region, i) => {
                let index = i;
                updateCountForRegion(data.country, region.region).then((sum)=>{
                    data.regions[index].learnerCount = sum;
                    countrySum += data.regions[index].learnerCount;
                }).catch((err)=>{
                    console.error(err);
                });
                i++;
            });
            data.learnerCount = countrySum;
            batches[batchCount].set(locRef.doc(id), data, {merge: true});
            batchSize++;
        });
        for (let i=0; i < batches.length; i++) {
            await new Promise(resolve => setTimeout(resolve, config.firebaseBatchTimeout));
            batches[i].commit().then(()=>{
                console.log('committed batch ', i);
            }).catch((err)=>{
                console.error(err);
            });
        }
        res.status(200).end();
    }).catch((err)=>{
        console.error(err);
        res.status(501).end();
    });
});
