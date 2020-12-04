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
  let country= 'MISSING';
  let campaign = 'MISSING';
  let referralSource = 'MISSING';
  const splitString = req.body.campaignID.split('|');
  if (splitString.length >= 3) {
    if (splitString[0]) {
      campaign = splitString[0];
    } if (splitString[1]) {
      country = splitString[1];
    } if (splitString[2]) {
      referralSource = splitString[2];
    }
  }
  let amount = Number(req.body.amount);
  if (req.body.coveredByDonor) {
    amount = amount - Number(req.body.coveredByDonor);
  }
  const params = {
    firstName: req.body.firstName,
    email: req.body.email,
    timestamp: admin.firestore.Firestore.Timestamp.now(),
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
      throw new Error('received undefined cost per learner');
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
      startDate: params.timestamp,
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
      return this.sendNewLearnersEmail(params.firstName, params.email);
    }).catch((err)=>{
      console.error(err);
    });
  }).catch((err) =>{
    console.error(err);
  });
};

exports.sendNewLearnersEmail = function(displayName, email) {
  if (!email || email === '') {
    console.error('cannot send email without an address!');
  }
  const actionCodeSettings = {
    url: 'https://followthelearners.curiouslearning.org/campaigns',
    handleCodeInApp: true,
  };
  return admin.auth()
      .generateSignInWithEmailLink(email, actionCodeSettings)
      .then((link)=>{
        return this.generateNewLearnersEmail(
            displayName,
            email,
            link,
        );
      }).catch((err)=>{
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
      dateCreated: params.timestamp,
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

exports.generateNewLearnersEmail = function(name, email, url) {
  const transporter = nodemailer.createTransport(mailConfig);
  const capitalized = name.charAt(0).toUpperCase();
  const formattedName = capitalized + name.slice(1);

  const mailOptions = {
    from: 'followthelearners@curiouslearning.org',
    to: email,
    subject: 'Follow The Learners -- Your Learners are Ready!',
    text: 'Hi '+formattedName+', thank you for helping support Follow the Learners! Click the link below, navigate to the "Your Learners" section, and enter your email to view how we\'re using your donation to bring reading into the lives of children!\n\n'+url+'\n\nFollow the Learners is currently in beta, and we\'re still ironing out some of the wrinkles! If you don\'t see your learners appear after about 5 minutes, please contact support@curiouslearning.org and we will be happy to assist you. ',
  };
  return transporter.sendMail(mailOptions, (error, info)=>{
    if (error) {
      console.error(error);
    } else {
      console.log('email sent: ' + info.response);
      return;
    }
  });
};
