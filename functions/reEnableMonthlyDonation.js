const functions = require('firebase-functions');
const admin = require('firebase-admin');
const helpers = require('./helpers/firebaseHelpers');
if (!admin.app) {
  admin.initializeApp();
}
exports.reEnableMonthlyDonation = functions.firestore
    .document('donor_master/{uid}/donations/{donationId}')
    .onUpdate((change, context)=>{
      const before = change.before.data();
      const after = change.after.data();
      // learnerCount never decreases so a drop in percentFilled
      // means an increase in the total donation amount
      if (before.percentFilled > after.percentFilled) {
        // removing the end date is the final step to allowing a monthly
        // donation to receive users again.
        after.ref.update({endDate: admin.firestore.FieldValue.delete()});
      }
    });
