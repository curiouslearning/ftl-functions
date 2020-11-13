const functions = require('firebase-functions');
const admin = require('firebase-admin');
const helpers = require('./helpers/firebaseHelpers');
if (!admin.app) {
  admin.initializeApp();
}
const firestore = admin.firestore();
exports.updateDonationLearnerCount = functions.firestore
    .document('/user_pool/{documentId}')
    .onUpdate((change, context)=>{
      const before = change.before.data();
      const after = change.after.data();
      if (!before) {
        return new Promise((resolve)=>{
          resolve('resolved');
        });
      }
      if (before.userStatus === 'unassigned'&&
          after.userStatus === 'assigned') {
        console.log('assigning');
        const donor = after.sourceDonor;
        const donation = after.sourceDonation;
        return updateLocationBreakdownForDonation(donor, donation);
      }
      return;
    });

exports.updateLocationBreakdownForDonation = function(donorID, donationID) {
  console.log('sourceDonation is ', donationID);
  const donationRef = firestore.collection('donor_master')
      .doc(donorID).collection('donations').doc(donationID);
  const poolRef = firestore.collection('user_pool')
      .where('sourceDonation', '==', donationID)
      .where('sourceDonor', '==', donorID);
  return poolRef.get().then((snap)=>{
    if (snap.empty) return {learners: 0, countries: []};
    let countries = [];
    snap.forEach((doc)=>{
      let data = doc.data();
      let index = helpers.findObjWithProperty(countries, 'country', data.country)
      if (index <0) {
        countries.push({country: data.country, learnerCount: 1, regions: []});
      } else {
        countries[index].learnerCount++;
      }
      let regions = countries[index].regions;
      let regIndex = helpers.findObjWithProperty(regions, 'region', data.region);
      if (regIndex <0) {
        countries[index].regions.push({region: data.region, learnerCount: 1});
      } else {
        countries[index].regions[regIndex].learnerCount++;
      }
    });
    return {learners: snap.size, countries: countries};
  }).then((res)=>{
    return donationRef.update({learnerCount: res.learners,
      countries: res.countries}
    );
  }).catch((err)=>{
    console.error(err);
  })
}
