const functions = require('firebase-functions');
const admin = require('firebase-admin');
if (!admin.app) {
  admin.initializeApp();
}
exports.checkForDonationEndDate = functions.firestore
    .document('/donor_master/{donorId}/donations/{documentId}')
    .onUpdate((change, context) =>{
      if (change.after.data().percentFilled >= 100) {
        let data = change.after.data();
        if (!data.hasOwnProperty('endDate')) {
          return admin.firestore().collection('donor_master')
              .doc(context.params.donorId).collection('donations')
              .doc(context.params.documentId).set({
                endDate: admin.firestore.Timestamp.now(),
              }, {merge: true}).then(()=>{
                return 'resolved';
              });
        }
        return new Promise((resolve)=>{
          resolve('resolved');
        });
      }
    });
