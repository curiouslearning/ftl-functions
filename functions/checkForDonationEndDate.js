const functions = require('firebase-functions');
const admin = require('firebase-admin');
if (!admin.apps.length === 0) {
  admin.initializeApp();
}
exports.checkForDonationEndDate = functions.firestore
    .document('/donor_master/{donorId}/donations/{documentId}')
    .onUpdate((change, context) =>{
      if (change.after.data().percentFilled >= 100) {
        let data = change.after.data();
        if (!data.hasOwnProperty('endDate')) {
          data['endDate'] = admin.firestore.Firestore.Timestamp.now();
          return admin.firestore().collection('donor_master')
              .doc(context.params.donorId).collection('donations')
              .doc(context.params.documentId).set({
                endDate: data.endDate,
              }, {merge: true}).then(()=>{
                return {status: 200, data: data};
              }).catch((err)=>{
                console.log(err);
                return {
                  status: 400,
                  data: `encountered an error and could not continue: ${err}`,
                };
              });
        }
      }
      return new Promise((res, rej)=>{
        res({status: 200, data: 'did not update document'});
      });
    });
