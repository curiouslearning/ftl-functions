const functions = require('firebase-functions');
const admin = require('firebase-admin');
if (!admin.app) {
  admin.initializeApp();
}
// If a user is added to a country with a disabled campaign, re-enable it
exports.enableCampaign = functions.firestore.document('/user_pool/{docID}').
    onCreate((snap, context)=>{
      let data = snap.data();
      if (data === undefined || data.country === undefined) {
        return;
      }
      return admin.firestore().collection('campaigns')
          .where('country', '==', data.country)
          .where('isActive', '==', true)
          .where('isVisible', '==', false)
          .limit(1).get().then((snap)=>{
            if (snap.empty) {
              return new Promise((resolve)=>{
                resolve('no disabled campaigns');
              });
            } else {
              let id = snap.docs[0].id;
              return admin.firestore().collection('campaigns').doc(id).update({
                isVisible: true,
              });
            }
          }).catch((err)=>{
            console.error(err);
          });
    });
