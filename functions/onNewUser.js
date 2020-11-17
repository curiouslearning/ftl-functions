const functions = require('firebase-functions');
const admin = require('firebase-admin');
const helpers = require('./helpers/firebaseHelpers');
if (!admin.app) {
  admin.initializeApp();
}
const firestore = admin.firestore();

exports.onNewUser = functions.firestore
    .document('user_pool/{docId}').onCreate((snap, context)=>{
      try {
        const newDoc = snap.data();
        if (newDoc.countedInMasterCount && newDoc.countedInRegion &&
        newDoc.countedInCampaign) {
          return {
            status: 200,
            data: `${snap.id} is already counted`,
          };
        }
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
        }).then((res) => {
          return {
            status: 200,
            data: `${context.params.docId} successfully counted`
          };
        }).catch((err)=>{
          console.log(err);
          return {status: 501, data: `encountered an error! ${err}`};
        });
      } catch (e) {
        console.log(e);
        return {status: 501, data: `encountered an error! ${e}`};
      }
    });
