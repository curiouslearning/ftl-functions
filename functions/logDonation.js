const admin = require('firebase-admin');
const helpers = require('./helpers/firebaseHelpers');
const assignLearners = require('./helpers/assignLearners');
const {isEmpty, get} = require('lodash');

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const DEFAULTCPL = 1.0;

// TODO: refactor this to have non-essential queries run in an onCreate event
exports.writeDonation = async function(params, existingDonation) {
  if(!existingDonation) existingDonation = {};
  const dbRef = admin.firestore().collection('donor_master');
  if (!params.email || params.email === 'MISSING') {
    console.error('No email was provided to identify or create a user!');
  }
  let costPerLearner = get(existingDonation, 'costPerLearner',
      params.country === 'any' ? DEFAULTCPL : await helpers.getCostPerLearner(params.campaignID));

  const docRef = dbRef.doc(params.sourceDonor);
  params['learnerCount'] = get(existingDonation, 'learnerCount', 0);
  params['costPerLearner'] = costPerLearner;
  params['countries'] = get(existingDonation, 'countries', []);
  params['startDate'] = get(existingDonation, 'startDate', admin.firestore.Firestore.Timestamp.now());

  //If the donation already exists, only persist the updated document without assigning learners or sending an email
  if(!isEmpty(existingDonation)) {
    try {
      params.donationID = existingDonation.donationID;
      await docRef.collection('donations').doc(existingDonation.donationID).update(params);
    } catch(err) {
      console.error(`Error when trying to update the existing donation object with donationId: ${existingDonation.donationID}`);
      throw err;
    }
    return {id: existingDonation.donationID, params};
  }

  return docRef.collection('donations').add(params).then((doc)=>{
    const donationID = doc.id;
    doc.update({donationID: donationID});
    return assignLearners.assign(params.sourceDonor, donationID, params.country);
  }).then(()=>{
    return helpers.sendEmail(params.sourceDonor, 'donationStart');
  }).catch((err)=>{
    console.error(err);
  });
};
