const admin = require('firebase-admin');
const helpers = require('./helpers/firebaseHelpers');
const {isEmpty, get} = require('lodash');
const functions = require('firebase-functions');

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const DEFAULTCPL = 1.0;
exports.logDonation = functions.https.onRequest(async (req, res) =>{
  if (!req.body) {
    return res.status(400).send('no data supplied!');
  }
  try {
    const event = req.body;

    const splitString = (event.campaignID||'').split('|');

    let campaign = splitString[0] || 'MISSING'
    let country = splitString[1] || 'MISSING'
    let referralSource = splitString[2] || 'MISSING'
    let amount = Number(event.amount);
    if (event.coveredByDonor) {
      amount = amount - Number(event.coveredByDonor);
    }
    const params = {
      firstName: event.firstName,
      email: event.email,
      amount: amount,
      frequency: event.frequency,
      campaignID: campaign,
      country: country,
      referralSource: referralSource,
    };
    for (param in params) {
      if (params[param] && params[param] === 'MISSING') {
        params['needsAttention'] = true;
      } else if (!params[param]) {
        params[param] = 'MISSING';
        params['needsAttention'] = true;
      }
    }
    try {
      params.sourceDonor = await helpers.getOrCreateDonor(params);
    } catch(err) {
      console.err(err);
    }

    await this.writeDonation(params)
    const msg = {msg:'successfully handled payment', uid: params.sourceDonor};
    return res.status(200).send({msg: msg, data: event});
  } catch (err) {
    const msg = {err: err};
    console.error(`encountered an error handling payment: ${err}`);
    return res.status(500).send({msg: msg, event: req.body})
  }
  });

// TODO: refactor this to have non-essential queries run in an onCreate event
exports.writeDonation = async function(params, existingDonation) {
  if(!existingDonation) existingDonation = {};
  const dbRef = admin.firestore().collection('donor_master');
  if (!params.email || params.email === 'MISSING') {
    console.error('No email was provided to identify or create a user!');
  }
  let costPerLearner;
  if (params.country === 'any') {
    costPerLearner = DEFAULTCPL;
  } else {
    costPerLearner = await helpers.getCostPerLearner(params.campaignID);
    if (!costPerLearner) {
      costPerLearner = DEFAULTCPL;
    }
  }
  const docRef = dbRef.doc(params.sourceDonor);
  params['learnerCount'] = get(existingDonation, 'learnerCount', 0);
  params['costPerLearner'] = costPerLearner;
  params['countries'] = get(existingDonation, 'countries', []);
  params['startDate'] = get(existingDonation, 'startDate', admin.firestore.Firestore.Timestamp.now());
  params['chargeId'] = get()
  //If the donation already exists, only persist the updated document without assigning learners or sending an email
  if(!isEmpty(existingDonation)) {
    try {
      if(!existingDonation.donationID) {
        console.error(`The existing donation with eventID: ${existingDonation.stripeEventId} does not have a donation ID.  Aborting`);
        throw new Error('Unable to persist donation due to lack of donation ID');
      }
      params.donationID = existingDonation.donationID;
      await docRef.collection('donations').doc(existingDonation.donationID).update(params);
    } catch(err) {
      console.error(`Error when trying to update the existing donation object with donationId: ${existingDonation.donationID}`);
      throw err;
    }
    return {sourceDonor: params.sourceDonor, donationId: existingDonation.donationID, country: params.country};
  }

  return docRef.collection('donations').add(params).then((doc)=>{
    const donationID = doc.id;
    doc.update({donationID: donationID});
    return {sourceDonor: params.sourceDonor, donationID, country: params.country};
  }).catch((err)=>{
    console.error(err);
  });
};
