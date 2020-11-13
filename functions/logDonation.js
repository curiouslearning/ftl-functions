const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cors = require('cors')({origin: true});
const mailConfig = require('../keys/nodemailerConfig.json');
const {Client, Status} = require('@googlemaps/google-maps-services-js');
const BatchManager = require('./batchManager').BatchManager;
require('./helpers/firebaseHelpers');

admin.initializeApp();
const transporter = nodemailer.createTransport(mailConfig);
const gmaps = new Client({});

const DEFAULTCPL = 0.25;
const CONTINENTS = [
  'Africa',
  'Americas',
  'Antarctica',
  'Asia',
  'Europe',
  'Oceania',
];

exports.logDonation = functions.https.onRequest(async (req, res) =>{
  const splitString = req.body.campaignID.split('|');
  let amount = Number(req.body.amount);
  if (req.body.coveredByDonor) {
    amount = amount - Number(req.body.coveredByDonor);
  }
  const params = {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    timestamp: admin.firestore.Firestore.Timestamp.now(),
    amount: amount,
    frequency: req.body.frequency,
    campaignID: splitString[0],
    country: splitString[1],
  };
  writeDonation(params).then((result)=>{
    return res.status(200).send(result);
  }).catch((err)=>{
    console.error(err);
    return res.status(500).send(err);
  });
});


exports.writeDonation = function(params) {
  const dbRef = admin.firestore().collection('donor_master');
  let donorID ='';
  return getDonorID(params.email).then((foundID)=>{
    if (foundID === '') {
      return admin.auth().createUser({
        displayName: params.firstName,
        email: params.email,
      }).then((user)=>{
        const uid = user.uid;
        dbRef.doc(uid).set({
          firstName: params.firstName,
          lastName: params.lastName,
          email: params.email,
          dateCreated: params.timestamp,
          donorID: uid,
        });
        return uid;
      });
    } else {
      return foundID;
    }
  }).then((foundID)=>{
    donorID = foundID;
    console.log('id is: ' + donorID);
    if (params.country === 'any') {
      return DEFAULTCPL;
    }
    return getCostPerLearner(params.campaignID);
  }).then((costPerLearner)=>{
    const docRef = dbRef.doc(donorID);
    return docRef.collection('donations').add({
      campaignID: params.campaignID,
      learnerCount: 0,
      sourceDonor: donorID,
      amount: params.amount,
      costPerLearner: costPerLearner,
      frequency: params.frequency,
      countries: [],
      startDate: params.timestamp,
      country: params.country,
    }).then((doc)=>{
      const donationID = doc.id;
      doc.update({donationID: donationID});
      if (params.country === 'any') {
        return assignAnyLearner(donorID, donationID, params.country);
      }
      if (CONTINENTS.includes(params.country)) {
        return assignLearnersByContinent(donorID, donationID, params.country);
      }
      return assignInitialLearners(donorID, donationID, params.country);
    }).then((promise)=>{
      const actionCodeSettings = {
        url: 'https://followthelearners.curiouslearning.org/campaigns',
        handleCodeInApp: true,
      };
      return admin.auth()
          .generateSignInWithEmailLink(params.email, actionCodeSettings)
          .then((link)=>{
            return generateNewLearnersEmail(
                params.firstName,
                params.email,
                link,
            );
          }).catch((err)=>{
            console.error(err);
          });
    }).catch((err)=>{
      console.error(err);
    });
  }).catch((err) =>{
    console.error(err);
    return err;
  });
}
// Grab initial list of learners at donation time from user_pool
// and assign to donor according to donation amount and campaigns cost/learner
exports.assignInitialLearners= function(donorID, donationID, country) {
  // Grab the donation object we're migrating learners to
  const donorRef = getDonation(donorID, donationID);
  // the user pool we'll be pulling learners from
  const poolRef = admin.firestore().collection('user_pool')
      .where('country', '==', country).where('userStatus', '==', 'unassigned')
      .get().then((snapshot)=>{
        return snapshot;
      }).catch((err)=>{
        console.error(err);
      });
  // data from the base campaign object such as cost/learner
  const campaignRef = admin.firestore().collection('campaigns')
      .where('country', '==', country).get().then((snapshot)=>{
        if (snapshot.empty) {
          throw new Error('Missing Campaign Document for ID: ', country);
        }
        let docData = snapshot.docs[0].data();
        let docId = snapshot.docs[0].id;
        return {id: docId, data: docData};
      }).catch((err)=>{
        console.error(err);
      });

  return Promise.all([donorRef, poolRef, campaignRef]).then((vals)=>{
    if (vals[1].empty) {
      console.warn('No free users for campaign: ', vals[0].data.campaignID);
      return new Promise((resolve)=>{
        resolve('resolved');
      });
    }
    const amount = vals[0].data.amount;
    const costPerLearner = vals[2].data.costPerLearner;
    const cap = calculateUserCount(amount, 0, costPerLearner);
    console.log('cap is: ', cap);
    return batchWriteLearners(vals[1], vals[0], cap);
  }).catch((err)=>{
    console.error(err);
  });
}

// special assignment case that matches learners from any country
exports.assignAnyLearner = function(donorID, donationID) {
  const donorRef = getDonation(donorID, donationID);
  const poolRef = admin.firestore().collection('user_pool')
      .where('userStatus', '==', 'unassigned').get()
      .then((snapshot)=>{
        return snapshot;
      }).catch((err)=>{
        console.error(err);
      });
  const campaignRef = admin.firestore().collection('campaigns').get()
      .then((snapshot)=>{
        return snapshot;
      }).catch((err)=>{
        console.error(err);
      });
  return Promise.all([donorRef, poolRef, campaignRef]).then((vals)=>{
    if (vals[1].empty) {
      console.warn('No users available');
      return new Promise((resolve) => {
        resolve('resolved');
      });
    }
    if (vals[2].empty) {
      console.warn('no campaigns available');
      return new Promise((reject)=>{
        reject(new Error('no available campaigns'));
      });
    }
    console.log('adding learners to donation ',
        vals[0].id,
        ' from donor ',
        vals[0].data.sourceDonor);
    const amount = vals[0].data.amount;
    const costPerLearner = DEFAULTCPL;
    const learnerCount = calculateUserCount(amount, 0, costPerLearner);
    return batchWriteLearners(vals[1], vals[0], learnerCount);
  }).catch((err)=>{
    console.error(err);
  });
}

exports.assignLearnersByContinent= function(donorID, donationID, continent) {
  const donorRef = getDonation(donorID, donationID)
  const poolRef = admin.firestore().collection('user_pool')
      .where('continent', '==', continent)
      .where('userStatus', '==', 'unassigned').get().then((snapshot)=>{
        return snapshot;
      }).catch((err)=>{
        console.error(err);
      });
  const campaignRef = admin.firestore().collection('campaigns')
      .where('country', '==', continent).limit(1).get().then((snapshot)=>{
        if (snapshot.empty) {
          throw new Error('No campaign found for ', continent);
        }
        return snapshot.docs[0];
      }).catch((err)=>{
        console.error(err);
      });
  return Promise.all([donorRef, poolRef, campaignRef]).then((vals)=>{
    if (vals[1].empty) {
      return new Promise((resolve)=>{
        resolve('no users to assign');
      });
    }
    const amount = vals[0].data.amount;
    const costPerLearner = vals[2].data.costPerLearner;
    const cap = calculateUserCount(amount, 0, costPerLearner);
    return batchWriteLearners(vals[1], 0, cap);
  });
}

// add learners with country and region data to the front of the queue
exports.prioritizeLearnerQueue = function(queue) {
  if (queue.empty) {
    return queue.docs;
  }
  let prioritizedQueue = [];
  queue.forEach((doc)=>{
    let data = doc.data();
    if (data.region !== 'no-region') {
      prioritizedQueue.unshift(doc);
    } else {
      prioritizedQueue.push(doc);
    }
  });
  return prioritizedQueue;
}

// algorithm to calculate how many learners to assign to a donation
exports.calculateUserCount = function(amount, learnerCount, costPerLearner) {
  const DONATIONFILLTIMELINE = 7; // minimum days to fill a donation
  const learnerMax = Math.round(amount/costPerLearner);
  const maxDailyIncrease = Math.round(learnerMax/DONATIONFILLTIMELINE);
  return learnerCount + maxDailyIncrease;
}

// collect learner re-assign operations in batches
// each batch is less than the size of the consecutive document edit limit
exports.batchWriteLearners = function(snapshot, donation, learnerCount) {
  const donorID = donation.data.sourceDonor;
  console.log('donor is: ', donorID, ', donation is: ', donation.id);
  const donationRef = admin.firestore().collection('donor_master').doc(donorID)
      .collection('donations').doc(donation.id);
  const poolRef = admin.firestore().collection('user_pool');
  snapshot.docs = prioritizeLearnerQueue(snapshot);
  console.log('pool of size: ', snapshot.size);
  let batchManager = new BatchManager();
  for (let i=0; i < learnerCount; i++) {
    if (i >= snapshot.size) break;
    let learnerID = snapshot.docs[i].id;
    let data = snapshot.docs[i].data();
    if (data === undefined) continue;
    data.sourceDonor = donorID;
    data['sourceDonation'] = donation.id;
    data.userStatus = 'assigned';
    data['assignedOn'] = admin.firestore.Timestamp.now();
    batchManager.set(poolRef.doc(learnerID), data, true);
  }
  batchManager.commit();
}

exports.generateNewLearnersEmail = function(name, email, url) {
  const capitalized = name.charAt(0).toUpperCase();
  const formattedName = capitalized + name.slice(1);


  const mailOptions = {
    from: 'notifications@curiouslearning.org',
    to: email,
    subject: 'Follow The Learners -- Your Learners are Ready!',
    text: 'Hi '+formattedName+', thank you for helping support Follow the Learners! Click the link below, navigate to the "Your Learners" section, and enter your email to view how we\'re using your donation to bring reading into the lives of children!\n\n'+url+'\n\nFollow the Learners is currently in beta, and we\'re still ironing out some of the wrinkles! If you don\'t see your learners appear after about 5 minutes, please contact support@curiouslearning.org and we will be happy to assist you. ',
  };
  return transporter.sendMail(mailOptions, (error, info)=>{
    if (error) {
      console.error(error);
      promise.reject(error);
    } else {
      console.log('email sent: ' + info.response);
      return;
    }
  });
}
