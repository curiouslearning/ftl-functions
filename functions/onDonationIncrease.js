const functions = require('firebase-functions');
const admin = require('firebase-admin');
const helpers = require('./helpers/firebaseHelpers');
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const firestore = admin.firestore();
exports.onDonationIncrease = functions.firestore
    .document('donor_master/{uid}/donations/{donationId}')
    .onUpdate((change, context)=>{
      const before = change.before.data();
      const after = change.after.data();
      if (before.amount !== after.amount || !after.percentFilled) {
        return this.updatePercentFilled(change.after, context);
      }
      return new Promise((resolve)=>{
        resolve({status: 200, data: 'did not update document'});
      });
    });

exports.updatePercentFilled = (snap, context) => {
  let data = snap.data();
  const docRef = admin.firestore().collection('donor_master')
      .doc(data.sourceDonor)
      .collection('donations').doc(context.params.donationId);
  return admin.firestore().collection('campaigns')
      .where('campaignID', '==', data.campaignID).get().then((snap)=>{
        if (snap.empty) {
          throw new Error('missing campaign document for ', data.campaignID);
        }
        return snap.docs[0].data().costPerLearner;
      }).then((costPerLearner)=>{
        const amount = data.amount;
        const learnerCount = data.learnerCount;
        return (learnerCount/Math.round(amount / costPerLearner))*100;
      }).then((percent)=>{
        return docRef.update({
          percentFilled: Math.round(percent),
        });
      }).catch((err)=>{
        console.log(err);
        return {status: 501, data: `encountered an error! ${err}`};
      });
};
