
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
  console.log('determining how to assign learners');
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

  return Promise.all([donorRef, campaignRef]).then(async (vals)=>{
    const amount = vals[0].data.amount;
    const costPerLearner = vals[1].data.costPerLearner;
    const cap = this.calculateUserCount(amount, 0, costPerLearner);
    console.log('cap is: ', cap);
    return admin.firestore().collection('user_pool')
        .where('country', '==', country).where('userStatus', '==', 'unassigned')
        .limit(cap).get().then((snapshot)=>{
          if (snapshot.empty) {
            console.warn('No free users for campaign: ', vals[0].data.campaignID);
            return new Promise((resolve)=>{
              resolve('resolved');
            });
          }
          return this.batchWriteLearners(snapshot, vals[0], cap);
        }).catch((err)=>{
          console.error(err);
        });
  }).catch((err)=>{
    console.error(err);
  });
};

// special assignment case that matches learners from any country
exports.assignAnyLearner = function(donorID, donationID) {
  const donorRef = getDonation(donorID, donationID);
  const campaignRef = admin.firestore().collection('campaigns').get()
      .then((snapshot)=>{
        return snapshot;
      }).catch((err)=>{
        console.error(err);
      });
  return Promise.all([donorRef, campaignRef]).then((vals)=>{
    if (vals[1].empty) {
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
    return admin.firestore().collection('user_pool')
        .where('userStatus', '==', 'unassigned')
        .limit(learnerCount).get().then((snapshot)=>{
          if (snapshot.empty) {
            console.warn('No users available');
            return new Promise((resolve) => {
              resolve('resolved');
            });
          }
          return this.batchWriteLearners(snapshot, vals[0], learnerCount);
        }).catch((err)=>{
          console.error(err);
        });
  }).catch((err)=>{
    console.error(err);
  });
};

exports.assignLearnersByContinent= function(donorID, donationID, continent) {
  console.log('assigning by continent');
  const donorRef = helpers.getDonation(donorID, donationID);
  const campaignRef = admin.firestore().collection('campaigns')
      .where('country', '==', continent).limit(1).get().then((snapshot)=>{
        if (snapshot.empty) {
          throw new Error('No campaign found for ', continent);
        }
        return snapshot.docs[0];
      }).catch((err)=>{
        console.error(err);
      });
  return Promise.all([donorRef, campaignRef]).then((vals)=>{
    console.log('finished fetching data...');
    const amount = vals[0].data.amount;
    const costPerLearner = vals[1].data().costPerLearner;
    const cap = this.calculateUserCount(amount, 0, costPerLearner);
    console.log(`determined user cap is ${cap}`);
    return admin.firestore().collection('user_pool')
        .where('continent', '==', continent)
        .where('userStatus', '==', 'unassigned')
        .limit(cap).get().then((snapshot)=>{
          if (snapshot.empty) {
            console.log('no users to assign');
            return new Promise((resolve)=>{
              resolve('resolved');
            });
          }
          return this.batchWriteLearners(snapshot, vals[0], cap);
        }).catch((err)=>{
          console.error(err);
        });
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
  const maxDailyIncrease = Math.round(learnerMax/DONATIONFILLTIMELINE) || 1;
  return learnerCount + maxDailyIncrease;
};

// collect learner re-assign operations in batches
// each batch is less than the size of the consecutive document edit limit
exports.batchWriteLearners = function(snapshot, donation, learnerCount) {
  console.log('running learner assignment');
  const donorID = donation.data.sourceDonor;
  console.log('donor is: ', donorID, ', donation is: ', donation.id);
  const donationRef = admin.firestore().collection('donor_master').doc(donorID)
      .collection('donations').doc(donation.id);
  const poolRef = admin.firestore().collection('user_pool');
  snapshot.docs = this.prioritizeLearnerQueue(snapshot);
  console.log('pool of size: ', snapshot.size);
  let batchManager = new BatchManager();
  let learners = [];
  for (let i=0; i < learnerCount; i++) {
    if (i >= snapshot.size) break;
    let learnerID = snapshot.docs[i].id;
    let data = snapshot.docs[i].data();
    if (data === undefined) continue;
    data.sourceDonor = donorID;
    data['sourceDonation'] = donation.id;
    data.userStatus = 'assigned';
    data['assignedOn'] = admin.firestore.Firestore.Timestamp.now();
    learners.push(data);
    batchManager.set(poolRef.doc(learnerID), data, true);
  }
  this.addLearnersToDonationSummary(learners, donationRef, batchManager);
  batchManager.commit();
};

exports.addLearnersToDonationSummary = (learners, donation, batch) => {
  console.log('generating learner summary for donation');
  if (!learners || learners.length === 0) {
    console.error('no learners provided!');
  }
  let countries = [];
  let learnerCount = 0;
  for (learner in learners) {
    if (learners[learner]) {
      let country = learners[learner].country;
      const index = helpers.findObjWithProperty(countries, 'country', country);
      if (index < 0) {
        countries.push({
          country: country,
          learnerCount: 1,
          regions: [{
            region: learners[learner].region,
            learnerCount: 1,
          }],
        });
        learnerCount++;
      } else {
        const regions = countries[index].regions;
        const region = learners[learner].region;
        const regIndex = helpers.findObjWithProperty(regions, 'region', region);
        if (regIndex < 0) {
          countries[index].regions.push({
            region: learners[learner].region,
            learnerCount: 1,
          });
          countries[index].learnerCount++;
          learnerCount++;
        } else {
          countries[index].regions[regIndex].learnerCount++;
          countries[index].learnerCount++;
          learnerCount++;
        }
      }
    }
  }
  batch.set(donation, {countries: countries, learnerCount: learnerCount}, true);
  return;
};
