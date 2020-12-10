const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cors = require('cors')({origin: true});
const mailConfig = require('./keys/nodemailerConfig.json');
const {Client, Status} = require('@googlemaps/google-maps-services-js');
const BatchManager = require('./batchManager').BatchManager;
const helpers = require('./helpers/firebaseHelpers');
const assignLearners = require('./helpers/assignLearners');
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const gmaps = new Client({});

const DEFAULTCPL = 1.0;
// exports.logDonation = functions.https.onRequest(async (req, res) =>{
//   if (!req.body) {
//     return res.status(400).send('no data supplied!');
//   }
//   try {
//     const event = req.body;
//
//     const splitString = (event.campaignID||'').split('|');
//
//     let campaign = splitString[0] || 'MISSING'
//     let country = splitString[1] || 'MISSING'
//     let referralSource = splitString[2] || 'MISSING'
//     let amount = Number(event.amount);
//     if (event.coveredByDonor) {
//       amount = amount - Number(event.coveredByDonor);
//     }
//     const params = {
//       firstName: event.firstName,
//       email: event.email,
//       amount: amount,
//       frequency: event.frequency,
//       campaignID: campaign,
//       country: country,
//       referralSource: referralSource,
//     };
//     for (param in params) {
//       if (params[param] && params[param] === 'MISSING') {
//         params['needsAttention'] = true;
//       } else if (!params[param]) {
//         params[param] = 'MISSING';
//         params['needsAttention'] = true;
//       }
//     }
//     const uid = await helpers.getOrCreateDonor(params.email);
//     params.sourceDonor = uid;
//     this.writeDonation(params)
//     const msg = {msg:'successfully handled payment', uid: uid};
//     return res.status(200).send({msg: msg, data: event});
//   } catch (err) {
//     const msg = {err: err};
//     console.error(`encountered an error handling payment: ${err}`);
//     return res.status(500).send({msg: msg, event: req.body})
//   }
//   });

// TODO: refactor this to have non-essential queries run in an onCreate event
exports.writeDonation = async function(params, existingDonation) {
  const dbRef = admin.firestore().collection('donor_master');
  if (!params.email || params.email === 'MISSING') {
    console.error('No email was provided to identify or create a user!');
  }
  let costPerLearner = existingDonation.costPerLearner;
  if(!existingDonation) {
    costPerLearner = params.country === 'any' ? DEFAULTCPL : await helpers.getCostPerLearner(params.campaignID);
  }

  const docRef = dbRef.doc(params.sourceDonor);
  const data = {
    chargeIds: params.chargeIds,
    campaignID: params.campaignID,
    learnerCount: 0,
    sourceDonor: params.sourceDonor,
    stripeEventId: params.stripeEventId,
    amount: params.amount,
    costPerLearner: costPerLearner,
    frequency: params.frequency,
    countries: [],
    startDate: existingDonation.startDate || admin.firestore.Firestore.Timestamp.now(),
    country: params.country,
  };
  if (params.needsAttention) {
    data['needsAttention'] = true;
  }

  //If the donation already exists, only persist the updated document without assigning learners or sending an email
  if(existingDonation) {
    await docRef.collection('donations').doc(existingDonation.donationID).update(data);
    return {id: existingDonation.donationID, data};
  }

  return docRef.collection('donations').add(data).then((doc)=>{
    const donationID = doc.id;
    doc.update({donationID: donationID});
    return assignLearners.assign(params.sourceDonor, donationID, params.country);
  }).then(()=>{
    return helpers.sendEmail(params.sourceDonor, 'donationStart');
  }).catch((err)=>{
    console.error(err);
  });
};
