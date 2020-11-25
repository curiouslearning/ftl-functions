
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const {Client, Status} = require('@googlemaps/google-maps-services-js');
const BatchManager = require('../batchManager').BatchManager;
const helpers = require('./firebaseHelpers');
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const gmaps = new Client({});

const CONTINENTS = [
  'Africa',
  'Americas',
  'Antarctica',
  'Asia',
  'Europe',
  'Oceania',
];

exports.assign = function(donorID, donationID, country) {
  if (country === 'any') {
    return this.assignAnyLearner(donorID, donationID, country);
  }
  if (CONTINENTS.includes(country)) {
    return this.assignLearnersByContinent(donorID, donationID, country);
  }
  return this.assignInitialLearners(donorID, donationID, country);
};
// Grab initial list of learners at donation time from user_pool
// and assign to donor according to donation amount and campaigns cost/learner
exports.assignInitialLearners= function(donorID, donationID, country) {
  // Grab the donation object we're migrating learners to
  const donorRef = helpers.getDonation(donorID, donationID);
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
          console.error('Missing Campaign Document for ID: ', country);
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
    const cap = this.calculateUserCount(amount, 0, costPerLearner);
    console.log('cap is: ', cap);
    return this.batchWriteLearners(vals[1], vals[0], cap);
  }).catch((err)=>{
    console.error(err);
  });
};

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
    const learnerCount = this.calculateUserCount(amount, 0, costPerLearner);
    return this.batchWriteLearners(vals[1], vals[0], learnerCount);
  }).catch((err)=>{
    console.error(err);
  });
};

exports.assignLearnersByContinent= function(donorID, donationID, continent) {
  const donorRef = getDonation(donorID, donationID);
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
    const costPerLearner = vals[2].data().costPerLearner;
    const cap = this.calculateUserCount(amount, 0, costPerLearner);
    return this.batchWriteLearners(vals[1], vals[0], cap);
  });
};

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
};

// algorithm to calculate how many learners to assign to a donation
exports.calculateUserCount = function(amount, learnerCount, costPerLearner) {
  const DONATIONFILLTIMELINE = 7; // minimum days to fill a donation
  const learnerMax = Math.round(amount/costPerLearner);
  const maxDailyIncrease = Math.round(learnerMax/DONATIONFILLTIMELINE);
  return learnerCount + maxDailyIncrease;
};

// collect learner re-assign operations in batches
// each batch is less than the size of the consecutive document edit limit
exports.batchWriteLearners = function(snapshot, donation, learnerCount) {
  const donorID = donation.data.sourceDonor;
  console.log('donor is: ', donorID, ', donation is: ', donation.id);
  const donationRef = admin.firestore().collection('donor_master').doc(donorID)
      .collection('donations').doc(donation.id);
  const poolRef = admin.firestore().collection('user_pool');
  snapshot.docs = this.prioritizeLearnerQueue(snapshot);
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
    data['assignedOn'] = admin.firestore.Firestore.Timestamp.now();
    batchManager.set(poolRef.doc(learnerID), data, true);
  }
  batchManager.commit();
};
