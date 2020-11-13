const functions = require('firebase-functions');
const admin = require('firebase-admin');
const helpers = require('./helpers/firebaseHelpers');
if (!admin.app) {
  admin.initializeApp();
}
const firestore = admin.firestore();

exports.onNewUser = functions.firestore
    .document('user_pool/{docId}').onCreate((snap, context)=>{
      const newDoc = snap.data();
      if (!newDoc.countedInMasterCount) {
        helpers.updateMasterLearnerCount(newDoc.country);
      } if (!newDoc.countedInRegion) {
        helpers.updateCountForRegion(newDoc.country, newDoc.region);
      } if (!newDoc.countedInCampaign) {
        helpers.updateCountForCampaign(newDoc.sourceCampaign);
      }
      return snap.ref.update({
        countedInMasterCount: true,
        countedInRegion: true,
        countedInCampaign: true,
      }).catch((err)=>{
        console.error(err);
      });
    });
