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
exports.logDonation = functions.https.onRequest(async (req, res) =>{
  if (!req.body) {
    res.status(501).send('no data supplied!');
    return;
  }

  const splitString = (req.body.campaignID||'').split('|');

  let campaign = splitString[0] || 'MISSING'
  let country = splitString[1] || 'MISSING'
  let referralSource = splitString[2] || 'MISSING'

  let amount = Number(req.body.amount);
  if (req.body.coveredByDonor) {
    amount = amount - Number(req.body.coveredByDonor);
  }
  const params = {
    firstName: req.body.firstName,
    email: req.body.email,
    amount: amount,
    frequency: req.body.frequency,
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
  return this.writeDonation(params).then((result)=>{
    res.status(200).send(result);
  }).catch((err)=>{
    console.error(err);
    res.status(501).send(err);
  });
});

// TODO: refactor this to have non-essential queries run in an onCreate event
exports.writeDonation = function(params) {
  const dbRef = admin.firestore().collection('donor_master');
  let donorID ='';
  if (!params.email || params.email === 'MISSING') {
    console.error('No email was provided to identify or create a user!');
  }
  return helpers.getDonorID(params.email).then((foundID)=>{
    if (foundID === '') {
      console.log('creating new donor: ', params.email);
      return this.createDonor(params);
    } else {
      return foundID;
    }
  }).then((foundID)=>{
    donorID = foundID;
    console.log('id is: ' + donorID);
    if (params.country === 'any') {
      return DEFAULTCPL;
    }
    return helpers.getCostPerLearner(params.campaignID);
  }).then((costPerLearner)=>{
    if (!costPerLearner) {
      console.warn('received undefined cost per learner, using default');
      costPerLearner = DEFAULTCPL;
    }
    const docRef = dbRef.doc(donorID);
    const data = {
      campaignID: params.campaignID,
      learnerCount: 0,
      sourceDonor: donorID,
      stripeEventId: params.stripeEventId,
      amount: params.amount,
      costPerLearner: costPerLearner,
      frequency: params.frequency,
      countries: [],
      startDate: admin.firestore.Firestore.Timestamp.now(),
      country: params.country,
    };
    if (params.needsAttention) {
      data['needsAttention'] = true;
    }
    return docRef.collection('donations').add(data).then((doc)=>{
      const donationID = doc.id;
      doc.update({donationID: donationID});
      return assignLearners.assign(donorID, donationID, params.country);
    }).then(()=>{
      return helpers.sendEmail(params.sourceDonor, 'donationStart');
    }).catch((err)=>{
      console.error(err);
    });
  }).catch((err) =>{
    console.error(err);
  });
};

exports.createDonor = function(params) {
  const dbRef = admin.firestore().collection('donor_master');
  return admin.auth().createUser({
    displayName: params.firstName,
    email: params.email,
  }).then((user)=>{
    const uid = user.uid;
    const data = {
      firstName: params.firstName,
      email: params.email,
      dateCreated: admin.firestore.Firestore.Timestamp.now(),
      donorID: uid,
    };
    if (params.needsAttention) {
      data['needsAttention'] = true;
    }
    dbRef.doc(uid).set(data);
    return uid;
  }).catch((err) => {
    console.error(err);
  });
};
