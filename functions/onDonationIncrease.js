const functions = require('firebase-functions');
const admin = require('firebase-admin');
const helpers = require('./helpers/firebaseHelpers');
if (!admin.app) {
  admin.initializeApp();
}
const firestore = admin.firestore();
exports.onDonationIncrease = functions.firestore
    .document('donor_master/{uid}/donations/{donationId}')
    .onUpdate((change, context)=>{
      const before = change.before.data();
      const after = change.after.data();
      if (before.amount !== after.amount || !after.percentFilled) {
        return helpers.updatePercentFilled(change.after, context);
      }
      return new Promise((resolve)=>{
        resolve('resolved');
      });
    });
