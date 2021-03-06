const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cors = require('cors')({origin: true});
const mailConfig = require('./keys/nodemailerConfig.json');
const {Client, Status} = require('@googlemaps/google-maps-services-js');
const batchManager = require('./batchManager');
const addCountryToSummary = require('./addCountryToSummary');
exports.addCountryToSummary = addCountryToSummary.addCountryToSummary;
const checkDonation = require('./checkForDonationEndDate');
exports.checkForDonationEndDate = checkDonation.checkForDonationEndDate;
const disable = require('./disableCampaign');
exports.disableCampaign = disable.disableCampaign;
const enable = require('./enableCampaign');
exports.enableCampaign = enable.enableCampaign;
const logDonation = require('./logDonation');
exports.logDonation = logDonation.logDonation;
// const onNewUser = require('./onNewUser'); commented out to avoid double counting
// exports.onNewUser = onNewUser.onNewUser;
const reEnable = require('./reEnableMonthlyDonation');
exports.reEnableMonthlyDonation = reEnable.reEnableMonthlyDonation;
const updateDonation = require('./updateDonationLearnerCount');
exports.updateDonationLearnerCount = updateDonation.updateDonationLearnerCount;
const onDonation = require('./onDonationIncrease');
exports.onDonationIncrease = onDonation.onDonationIncrease;
const forceRegion = require('./forceRegionRecalculation');
exports.forceRegionRecalculation = forceRegion.forceRegionRecalculation;
const stripeHooks = require('./logStripeEvent');
exports.logPaymentIntent= stripeHooks.logPaymentIntent;
exports.testPaymentIntent= stripeHooks.testPaymentIntent;
const updateAccountEmail = require('./updateAccountEmail');
exports.forceUpdateAccountEmail = updateAccountEmail.forceUpdateAccountEmail;
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const transporter = nodemailer.createTransport(mailConfig);


const DEFAULTCPL = 0.25;
const CONTINENTS = [
  'Africa',
  'Americas',
  'Antarctica',
  'Asia',
  'Europe',
  'Oceania',
];

exports.updateAggregates = functions.https.onRequest(async (req, res) =>{
  console.log('hello');
  const masterCount = req.body.masterCount;
  const countries = req.body.countries;
  const campaigns = req.body.campaigns;
  console.log('update master count');
  updateMasterCount(masterCount);
  console.log('update campaigns');
  updateCampaignCounts(campaigns);
  console.log('update countries');
  updateLocationCounts(countries);
  console.log('successfully updated all counts');
  return res.status(200).send({masterCount: masterCount});
});

// exports.logDonation = functions.https.onRequest(async (req, res) =>{
//   const splitString = req.body.campaignID.split('|');
//   let amount = Number(req.body.amount);
//   if (req.body.coveredByDonor) {
//     amount = amount - Number(req.body.coveredByDonor);
//   }
//   const params = {
//     firstName: req.body.firstName,
//     lastName: req.body.lastName,
//     email: req.body.email,
//     timestamp: admin.firestore.Firestore.Timestamp.now(),
//     amount: amount,
//     frequency: req.body.frequency,
//     campaignID: splitString[0],
//     country: splitString[1],
//   };
//   writeDonation(params).then((result)=>{
//     return res.status(200).send(result);
//   }).catch((err)=>{
//     console.error(err);
//     return res.status(500).send(err);
//   });
// });
//
// function writeDonation(params) {
//   const dbRef = admin.firestore().collection('donor_master');
//   let donorID ='';
//   return getDonorID(params.email).then((foundID)=>{
//     if (foundID === '') {
//       return admin.auth().createUser({
//         displayName: params.firstName,
//         email: params.email,
//       }).then((user)=>{
//         const uid = user.uid;
//         dbRef.doc(uid).set({
//           firstName: params.firstName,
//           lastName: params.lastName,
//           email: params.email,
//           dateCreated: params.timestamp,
//           donorID: uid,
//         });
//         return uid;
//       });
//     } else {
//       return foundID;
//     }
//   }).then((foundID)=>{
//     donorID = foundID;
//     console.log('id is: ' + donorID);
//     if (params.country === 'any') {
//       return DEFAULTCPL;
//     }
//     return getCostPerLearner(params.campaignID);
//   }).then((costPerLearner)=>{
//     const docRef = dbRef.doc(donorID);
//     return docRef.collection('donations').add({
//       campaignID: params.campaignID,
//       learnerCount: 0,
//       sourceDonor: donorID,
//       amount: params.amount,
//       costPerLearner: costPerLearner,
//       frequency: params.frequency,
//       countries: [],
//       startDate: params.timestamp,
//       country: params.country,
//     }).then((doc)=>{
//       const donationID = doc.id;
//       doc.update({donationID: donationID});
//       if (params.country === 'any') {
//         return assignAnyLearner(donorID, donationID, params.country);
//       }
//       if (CONTINENTS.includes(params.country)) {
//         return assignLearnersByContinent(donorID, donationID, params.country);
//       }
//       return assignInitialLearners(donorID, donationID, params.country);
//     }).then((promise)=>{
//       const actionCodeSettings = {
//         url: 'https://followthelearners.curiouslearning.org/campaigns',
//         handleCodeInApp: true,
//       };
//       return admin.auth()
//           .generateSignInWithEmailLink(params.email, actionCodeSettings)
//           .then((link)=>{
//             return generateNewLearnersEmail(
//                 params.firstName,
//                 params.email,
//                 link,
//             );
//           }).catch((err)=>{
//             console.error(err);
//           });
//     }).catch((err)=>{
//       console.error(err);
//     });
//   }).catch((err) =>{
//     console.error(err);
//     return err;
//   });
// }

//
// function updateOldDonorAccount(email, uid) {
//   const dbref = firestore.collection('donor_master');
//   return dbref.where('email', '==', email).get.then((snap)=>{
//     if (snap.empty) return undefined;
//     if (snap.docs[0].id !== uid) {
//       let id = snap.docs[0].id;
//       return dbref.doc(id).update({donorID: uid});
//     }
//     return undefined;
//   })
// }
//
// function generateNewLearnersEmail(name, email, url) {
//   const capitalized = name.charAt(0).toUpperCase();
//   const formattedName = capitalized + name.slice(1);
//
//
//   const mailOptions = {
//     from: 'notifications@curiouslearning.org',
//     to: email,
//     subject: 'Follow The Learners -- Your Learners are Ready!',
//     text: 'Hi '+formattedName+', thank you for helping support Follow the Learners! Click the link below, navigate to the "Your Learners" section, and enter your email to view how we\'re using your donation to bring reading into the lives of children!\n\n'+url+'\n\nFollow the Learners is currently in beta, and we\'re still ironing out some of the wrinkles! If you don\'t see your learners appear after about 5 minutes, please contact support@curiouslearning.org and we will be happy to assist you. ',
//   };
//   return transporter.sendMail(mailOptions, (error, info)=>{
//     if (error) {
//       console.error(error);
//       promise.reject(error);
//     } else {
//       console.log('email sent: ' + info.response);
//       return;
//     }
//   });
// }
//
// function getCostPerLearner(campaignID) {
//   return admin.firestore().collection('campaigns')
//       .where('campaignID', '==', campaignID)
//       .get().then((snap)=>{
//         if (snap.empty) {
//           throw new Error('can\'t find campaign with ID: ', campaignID);
//         }
//         return snap.docs[0].data().costPerLearner;
//       }).catch((err)=>{
//         console.error(err);
//       });
// }
//
// function getDonorID(email) {
//   return admin.auth().getUserByEmail(email)
//       .then((user)=>{
//         return user.uid;
//       }).catch((err)=>{
//         if (err.code === 'auth/user-not-found') {
//           console.log('No Donor found for email: ', email);
//           return '';
//         } else throw new Error(err);
//       });
// }
//
// function getDonation(donorID, donationID) {
//   return admin.firestore().collection('donor_master').doc(donorID)
//       .collection('donations').doc(donationID)
//       .get().then((doc)=>{
//         if (!doc.exists) {
//           throw new Error(
//               donorID,
//               ' is missing Donation Document: ',
//               donationID,
//           );
//         }
//         return {id: doc.id, data: doc.data()};
//       }).catch((err)=>{
//         console.error(err);
//       });
// }
//
// // Grab initial list of learners at donation time from user_pool
// // and assign to donor according to donation amount and campaigns cost/learner
// function assignInitialLearners(donorID, donationID, country) {
//   // Grab the donation object we're migrating learners to
//   const donorRef = getDonation(donorID, donationID);
//   // the user pool we'll be pulling learners from
//   const poolRef = admin.firestore().collection('user_pool')
//       .where('country', '==', country).where('userStatus', '==', 'unassigned')
//       .get().then((snapshot)=>{
//         return snapshot;
//       }).catch((err)=>{
//         console.error(err);
//       });
//   // data from the base campaign object such as cost/learner
//   const campaignRef = admin.firestore().collection('campaigns')
//       .where('country', '==', country).get().then((snapshot)=>{
//         if (snapshot.empty) {
//           throw new Error('Missing Campaign Document for ID: ', country);
//         }
//         let docData = snapshot.docs[0].data();
//         let docId = snapshot.docs[0].id;
//         return {id: docId, data: docData};
//       }).catch((err)=>{
//         console.error(err);
//       });
//
//   return Promise.all([donorRef, poolRef, campaignRef]).then((vals)=>{
//     if (vals[1].empty) {
//       console.warn('No free users for campaign: ', vals[0].data.campaignID);
//       return new Promise((resolve)=>{
//         resolve('resolved');
//       });
//     }
//     const amount = vals[0].data.amount;
//     const costPerLearner = vals[2].data.costPerLearner;
//     const cap = calculateUserCount(amount, 0, costPerLearner);
//     console.log('cap is: ', cap);
//     return batchWriteLearners(vals[1], vals[0], cap);
//   }).catch((err)=>{
//     console.error(err);
//   });
// }
//
// // special assignment case that matches learners from any country
// function assignAnyLearner(donorID, donationID) {
//   const donorRef = getDonation(donorID, donationID);
//   const poolRef = admin.firestore().collection('user_pool')
//       .where('userStatus', '==', 'unassigned').get()
//       .then((snapshot)=>{
//         return snapshot;
//       }).catch((err)=>{
//         console.error(err);
//       });
//   const campaignRef = admin.firestore().collection('campaigns').get()
//       .then((snapshot)=>{
//         return snapshot;
//       }).catch((err)=>{
//         console.error(err);
//       });
//   return Promise.all([donorRef, poolRef, campaignRef]).then((vals)=>{
//     if (vals[1].empty) {
//       console.warn('No users available');
//       return new Promise((resolve) => {
//         resolve('resolved');
//       });
//     }
//     if (vals[2].empty) {
//       console.warn('no campaigns available');
//       return new Promise((reject)=>{
//         reject(new Error('no available campaigns'));
//       });
//     }
//     console.log('adding learners to donation ',
//         vals[0].id,
//         ' from donor ',
//         vals[0].data.sourceDonor);
//     const amount = vals[0].data.amount;
//     const costPerLearner = DEFAULTCPL;
//     const learnerCount = calculateUserCount(amount, 0, costPerLearner);
//     return batchWriteLearners(vals[1], vals[0], learnerCount);
//   }).catch((err)=>{
//     console.error(err);
//   });
// }
//
// async function assignLearnersByContinent(donorID, donationID, continent) {
//   const donorRef = getDonation(donorID, donationID)
//   const poolRef = admin.firestore().collection('user_pool')
//       .where('continent', '==', continent)
//       .where('userStatus', '==', 'unassigned').get().then((snapshot)=>{
//         return snapshot;
//       }).catch((err)=>{
//         console.error(err);
//       });
//   const campaignRef = admin.firestore().collection('campaigns')
//       .where('country', '==', continent).limit(1).get().then((snapshot)=>{
//         if (snapshot.empty) {
//           throw new Error('No campaign found for ', continent);
//         }
//         return snapshot.docs[0];
//       }).catch((err)=>{
//         console.error(err);
//       });
//   return Promise.all([donorRef, poolRef, campaignRef]).then((vals)=>{
//     if (vals[1].empty) {
//       return new Promise((resolve)=>{
//         resolve('no users to assign');
//       });
//     }
//     const amount = vals[0].data.amount;
//     const costPerLearner = vals[2].data.costPerLearner;
//     const cap = calculateUserCount(amount, 0, costPerLearner);
//     return batchWriteLearners(vals[1], 0, cap);
//   });
// }
//
// // add learners with country and region data to the front of the queue
// function prioritizeLearnerQueue(queue) {
//   if (queue.empty) {
//     return queue.docs;
//   }
//   let prioritizedQueue = [];
//   queue.forEach((doc)=>{
//     let data = doc.data();
//     if (data.region !== 'no-region') {
//       prioritizedQueue.unshift(doc);
//     } else {
//       prioritizedQueue.push(doc);
//     }
//   });
//   return prioritizedQueue;
// }
//
// // algorithm to calculate how many learners to assign to a donation
// function calculateUserCount(amount, learnerCount, costPerLearner) {
//   const DONATIONFILLTIMELINE = 7; // minimum days to fill a donation
//   const learnerMax = Math.round(amount/costPerLearner);
//   const maxDailyIncrease = Math.round(learnerMax/DONATIONFILLTIMELINE);
//   return learnerCount + maxDailyIncrease;
// }
//
// // collect learner re-assign operations in batches
// // each batch is less than the size of the consecutive document edit limit
// function batchWriteLearners(snapshot, donation, learnerCount) {
//   const donorID = donation.data.sourceDonor;
//   console.log('donor is: ', donorID, ', donation is: ', donation.id);
//   const donationRef = admin.firestore().collection('donor_master').doc(donorID)
//       .collection('donations').doc(donation.id);
//   const poolRef = admin.firestore().collection('user_pool');
//   snapshot.docs = prioritizeLearnerQueue(snapshot);
//   console.log('pool of size: ', snapshot.size);
//   let batchManager = new batchManager.BatchManager();
//   for (let i=0; i < learnerCount; i++) {
//     if (i >= snapshot.size) break;
//     let learnerID = snapshot.docs[i].id;
//     let data = snapshot.docs[i].data();
//     if (data === undefined) continue;
//     data.sourceDonor = donorID;
//     data['sourceDonation'] = donation.id;
//     data.userStatus = 'assigned';
//     data['assignedOn'] = admin.firestore.Timestamp.now();
//     batchManager.set(poolRef.doc(learnerID), data, true);
//   }
//   batchManager.commit();
// }
//
exports.forceUpdateAggregates = functions.https.onRequest(async (req, res) =>{
  try {
    forceUpdateLocations();
    forceUpdateCampaigns();
    forceUpdateMasterCounts();
    res.status(200).send({msg: 'Successfully forced an update'});
  } catch (e) {
    res.status(400).send({
      msg: 'Did not successfully update! Encountered an error',
      err: e,
    });
  }
});

// Recalculate the learner counts for each country and region in the database
function forceUpdateLocations() {
  const dbRef = admin.firestore().collection('loc_ref');
  return dbRef.get().then((snap)=>{
    snap.forEach((doc)=> {
      const data = doc.data();
      setCountsForCountry(data);
    });
    return 'Success!';
  }).catch((err)=>{
    console.error(err);
  });
}

/**
* Recalculate the learner counts for the provided country and its regions
* @param {Object} countryDoc the data from the country's DocumentSnapshot
*/
async function setCountsForCountry(countryDoc) {
  const countryName = countryDoc.country;
  const dbRef = admin.firestore().collection('user_pool')
      .where('country', '==', countryName);
  const msgRef = admin.firestore().collection('loc_ref').doc(countryName);
  let regions = countryDoc.regions;
  for (const region in regions) {
    if (regions[region]) {
      regions[region].learnerCount = 0;
    }
  }
  try {
    const res = await admin.firestore().runTransaction(async (t)=>{
      const snap = await t.get(dbRef);
      const totalCount = snap.size;
      snap.forEach((doc)=>{
        const index = findObjWithProperty(regions, 'region', doc.data().region);
        if (index <0) {
          regions.push({
            region: doc.data().region,
            learnerCount: 1,
          });
        } else {
          regions[index].learnerCount++;
        }
      });
      await t.set(msgRef, {
        learnerCount: totalCount,
        regions: regions,
      }, {merge: true});
      return 'set counts for '+ countryName+ ', new total is '+ totalCount;
    });
    console.log('Transaction Success: ', res);
  } catch (e) {
    console.log('Transaction Failed: ', e);
  }
}

// Recalculate the learner count for each campaign document
function forceUpdateCampaigns() {
  const dbRef = admin.firestore().collection('campaigns');
  return dbRef.get().then((snap)=>{
    snap.forEach((doc)=>{
      const data = doc.data();
      setCountForCampaign(data);
    });
    return 'Success!';
  }).catch((err)=>{
    console.error(err);
  });
}

/**
* Recalculate the learner count for the given campaign
* @param {Object} campaignDoc the data from this campaign's DocumentSnapshot
*/
async function setCountForCampaign(campaignDoc) {
  const campaignID = campaignDoc.campaignID;
  const dbRef = admin.firestore().collection('user_pool')
      .where('sourceCampaign', '==', campaignID);
  const msgRef = admin.firestore().collection('campaigns').doc(campaignID);
  try {
    const res = await admin.firestore().runTransaction(async (t)=>{
      const newTotal = await t.get(dbRef).then((snap)=>{
        return snap.size;
      });
      await t.update(msgRef, {learnerCount: newTotal});
      return 'Set learner count of ' +campaignID + ' to '+newTotal;
    });
    console.log('Transaction Success: ', res);
  } catch (e) {
    console.log('Transaction Failed: ', e);
  }
}

// Recalculate the master count of learners in the database
async function forceUpdateMasterCounts() {
  const dbRef = admin.firestore().collection('user_pool');
  const dnt = dbRef.where('country', '==', 'no-country');
  try {
    const res = await admin.firestore().runTransaction(async (t)=>{
      const totalCount = await t.get(dbRef).then((snap)=>{
        return snap.size;
      });
      const newDNTCount = await t.get(dnt).then((snap)=>{
        return snap.size;
      });
      const msgRef = admin.firestore().collection('aggregate_data').doc('data');
      await t.update(msgRef, {
        allLearnersCount: totalCount,
        allLearnersWithDoNotTrack: newDNTCount,
      });
      return 'Counted '+totalCount+' learners with '+newDNTCount+' using DNT';
    });
    console.log( 'Transaction Success: ', res);
  } catch (e) {
    console.log('Transaction Failed: ', e);
  }
}

// exports.checkForDonationEndDate = functions.firestore
//     .document('/donor_master/{donorId}/donations/{documentId}')
//     .onUpdate((change, context) =>{
//       if (change.after.data().percentFilled >= 100) {
//         let data = change.after.data();
//         if (!data.hasOwnProperty('endDate')) {
//           return admin.firestore().collection('donor_master')
//               .doc(context.params.donorId).collection('donations')
//               .doc(context.params.documentId).set({
//                 endDate: admin.firestore.Timestamp.now(),
//               }, {merge: true}).then(()=>{
//                 return 'resolved';
//               });
//         }
//         return new Promise((resolve)=>{
//           resolve('resolved');
//         });
//       }
//     });
//
// // If a user is added to a country with a disabled campaign, re-enable it
// exports.enableCampaign = functions.firestore.document('/user_pool/{docID}').
//     onCreate((snap, context)=>{
//       let data = snap.data();
//       if (data === undefined || data.country === undefined) {
//         return;
//       }
//       return admin.firestore().collection('campaigns')
//           .where('country', '==', data.country)
//           .where('isActive', '==', true)
//           .where('isVisible', '==', false)
//           .limit(1).get().then((snap)=>{
//             if (snap.empty) {
//               return new Promise((resolve)=>{
//                 resolve('no disabled campaigns');
//               });
//             } else {
//               let id = snap.docs[0].id;
//               return admin.firestore().collection('campaigns').doc(id).update({
//                 isVisible: true,
//               });
//             }
//           }).catch((err)=>{
//             console.error(err);
//           });
//     });
//
// // if the last user for a country is removed from the pool, disable that
// // country in the database
// exports.disableCampaign = functions.firestore.document('/user_pool/{docID}')
//     .onUpdate((change, context)=>{
//       const before = change.before.data();
//       const after = change.after.data();
//       if (before.userStatus === unassigned && after.userStatus !== unassigned) {
//         admin.firestore().collection('user_pool')
//             .where('country', '==', after.country)
//             .where('sourceCampaign', '==', after.sourceCampaign)
//             .where('userStatus', '==', 'unassigned')
//             .get().then((snap)=>{
//               if (snap.size === 0) {
//                 const msgRef = admin.firestore().collection('campaigns')
//                     .doc(campaign);
//                 return msgRef.update({isVisible: false});
//               }
//               return new Promise((resolve)=>{
//                 resolve('found learners');
//               });
//             }).catch((err)=>{
//               console.error(err);
//             });
//       }
//     });
//
// function getPinForAddress(address) {
//   let markerLoc = {lat: 0, lng: 0};
//   return gmaps.geocode({
//     params: {
//       address: address,
//       key: 'AIzaSyDEl20cTMsc72W_TasuK5PlWYIgMrzyuAU',
//     },
//     timeout: 1000,
//   }).then((r) => {
//     if (r.data.results[0]) {
//       markerLoc = r.data.results[0].geometry.location;
//     }
//     return markerLoc;
//   }).catch((e) => {
//     console.log(e.response.data.error_message);
//   });
// }

function getRegionsForCountry(docRef) {
  return docRef.get();
}

// exports.updateDonationLearnerCount = functions.firestore
//     .document('/user_pool/{documentId}')
//     .onUpdate((change, context)=>{
//       const before = change.before.data();
//       const after = change.after.data();
//       if (!before) {
//         return new Promise((resolve)=>{
//           resolve('resolved');
//         });
//       }
//       if (before.userStatus === 'unassigned'&&
//           after.userStatus === 'assigned') {
//         console.log('assigning');
//         const donor = after.sourceDonor;
//         const donation = after.sourceDonation;
//         return updateLocationBreakdownForDonation(donor, donation);
//       }
//       return;
//     });

// function updateMasterLearnerCount(country) {
//   const msgRef = admin.firestore().collection('aggregate_data').doc('data');
//   return msgRef.get().then((doc)=>{
//     let count = doc.data().allLearnersCount + 1;
//     let noCountry = doc.data().allLearnersWithDoNotTrack;
//     if (country === 'no-country') {
//       noCountry++;
//     }
//     return msgRef.update({
//       allLearnersCount: count,
//       allLearnersWithDoNotTrack: noCountry,
//     });
//   }).catch((err)=>{
//     console.error(err);
//   });
// }
//
// exports.onNewUser = functions.firestore
//     .document('user_pool/{docId}').onCreate((snap, context)=>{
//       const newDoc = snap.data();
//       if (!newDoc.countedInMasterCount) {
//         updateMasterLearnerCount(newDoc.country);
//       } if (!newDoc.countedInRegion) {
//         updateCountForRegion(newDoc.country, newDoc.region);
//       } if (!newDoc.countedInCampaign) {
//         updateCountForCampaign(newDoc.sourceCampaign);
//       }
//       return snap.ref.update({
//         countedInMasterCount: true,
//         countedInRegion: true,
//         countedInCampaign: true,
//       }).catch((err)=>{
//         console.error(err);
//       });
//     });

exports.updateAggregateData = functions.firestore
    .document('/loc_ref/{documentID}').onUpdate((change, context)=>{
      const before = change.before.data();
      const after = change.after.data();
      if (change.after.learnerCount !== before.learnerCount) {
        const sumRef = admin.firestore()
            .collection('aggregate_data').doc('data');
        return admin.firestore().collection('loc_ref').get().then((snap)=>{
          let sum = 0;
          let dntSum = 0;
          snap.forEach((doc)=>{
            sum += doc.data().learnerCount;
            if (doc.data().country === 'no-country') {
              dntSum += doc.data().learnerCount;
            }
          });
          return {sum: sum, noCountry: dntSum};
        }).catch((err)=>{
          console.error(err);
        });
      }
      return new Promise((resolve)=>{
        resolve('resolved');
      });
    });

// exports.onDonationIncrease = functions.firestore
//     .document('donor_master/{uid}/donations/{donationId}')
//     .onUpdate((change, context)=>{
//       const before = change.before.data();
//       const after = change.after.data();
//       if (before.amount !== after.amount || !after.percentFilled) {
//         return updatePercentFilled(change.after, context);
//       }
//       return new Promise((resolve)=>{
//         resolve('resolved');
//       });
//     });

// exports.reEnableMonthlyDonation = functions.firestore
//     .document('donor_master/{uid}/donations/{donationId}')
//     .onUpdate((change, context)=>{
//       const before = change.before.data();
//       const after = change.after.data();
//       // learnerCount never decreases so a drop in percentFilled
//       // means an increase in the total donation amount
//       if (before.percentFilled > after.percentFilled) {
//         // removing the end date is the final step to allowing a monthly
//         // donation to receive users again.
//         after.ref.update({endDate: admin.firestore.FieldValue.delete()});
//       }
//     });

// increment the master learner count by the value provided
async function updateMasterCount(count) {
  const docRef = admin.firestore().collection('aggregate_data').doc('data');
  try {
    const res = await admin.firestore().runTransaction(async (t)=>{
      const doc = await t.get(docRef);
      const newCount = doc.data().allLearnersCount + count;
      await t.update(docRef, {allLearnersCount: newCount});
      return 'Added ' + count + ' new users to database';
    });
    console.log('Transaction Success: ', res);
  } catch (e) {
    console.log('Transaction Failed: ', e);
  }
}

// increment the master count of learners with no Geo data by the count provided
async function updateDNTLearners(count) {
  const docRef = admin.firestore().collection('aggregate_data').doc('data');
  try {
    const res = await admin.firestore().runTransaction(async (t)=>{
      doc = await t.get(docRef);
      const newCount = doc.data().allLearnersWithDoNotTrack + count;
      await t.update(docRef, {allLearnersWithDoNotTrack: newCount});
      return 'Added ' + count + ' new users with Do Not Track';
    });
    console.log('Transaction Success: ', res);
  } catch (e) {
    console.log('Transaction Failed: ', e);
  }
}

// increment the learner counts for the listed campaigns by the counts provided
async function updateCampaignCounts(campaigns) {
  const dbRef = admin.firestore().collection('campaigns');
  for (const campaign in campaigns) {
    if (campaigns[campaign]) {
      const docRef = dbRef.doc(campaigns[campaign].campaign);
      const campaignName = campaigns[campaign].campaign;
      try {
        const res = await admin.firestore().runTransaction(async (t)=>{
          const doc = await t.get(docRef);
          if (!doc.exists) return 'No campaign document for '+campaignName;
          const oldCount = doc.data().learnerCount;
          const newUsers = campaigns[campaign].count;
          const newCount = oldCount + newUsers;
          await t.update(docRef, {learnerCount: newCount});
          return 'Added ' + newUsers + ' users to ' + campaignName;
        });
        console.log('Transaction Success: ', res);
      } catch (e) {
        console.log('Transaction Failed: ', e);
      }
    }
  }
}

// increment the counts for the country documents provided
function updateLocationCounts(countries) {
  const dbRef = admin.firestore().collection('loc_ref');
  for (const i in countries) {
    if (countries[i]) {
      if (countries[i].country === 'no-country') {
        updateDNTLearners(countries[i].count);
      } else {
        docRef = dbRef.doc(countries[i].country);
        updateCountForCountry(countries[i], docRef);
      }
    }
  }
}

// increment the provided country document's learner count (total and by region)
// by the amounts provided
async function updateCountForCountry(country, docRef) {
  console.log('updating count for ', country.country);
  try {
    const res = await admin.firestore().runTransaction(async (t) =>{
      const doc = await t.get(docRef);
      if (!doc.exists) return 'No document for '+ country.country;
      let regions = doc.data().regions;
      const newCount = doc.data().learnerCount + country.count;
      for (const region in regions) {
        if (regions[region]) {
          const regName = regions[region].region;
          const newCounts = country.regions;
          const index = findObjWithProperty(newCounts, 'region', regName);
          if (index !== -1) {
            regions[region].learnerCount += newCounts[index].count;
          }
        }
      }
      await t.set(docRef, {
        learnerCount: newCount,
        regions: regions,
      }, {merge: true});
      return 'updated counts for ' + country.country;
    });
    console.log('Transaction Success: ', res);
  } catch (e) {
    console.log('Transaction Failure');
    console.error(e);
  }
}

/**
* find the index of an element in arr that contains
* a property matching prop with a value matching val
* @param{Array[]} arr the array to iterate through
* @param{string} prop the name of the property to search for
* @param{Object} val the value of {prop}
* @return {int} the index of the matching element, -1 otherwise
*/
function findObjWithProperty(arr, prop, val) {
  for (let i=0; i < arr.length; i++) {
    if (arr[i].hasOwnProperty(prop) && arr[i][prop] === val) {
      return i;
    }
  }
  return -1;
}

// function updatePercentFilled(snap, context) {
//   let data = snap.data();
//   const docRef = admin.firestore().collection('donor_master')
//       .doc(data.sourceDonor)
//       .collection('donations').doc(context.params.donationId);
//   return admin.firestore().collection('campaigns')
//       .where('campaignID', '==', data.campaignID).get().then((snap)=>{
//         if (snap.empty) {
//           throw new Error('missing campaign document for ', data.campaignID);
//         }
//         return snap.docs[0].data().costPerLearner;
//       }).then((costPerLearner)=>{
//         const amount = data.amount;
//         const learnerCount = data.learnerCount;
//         return (learnerCount/Math.round(amount / costPerLearner))*100;
//       }).then((percent)=>{
//         return docRef.set({
//           percentFilled: Math.round(percent),
//         }, {merge: true});
//       }).catch((err)=>{
//         console.error(err);
//       });
// }

// function updateLocationBreakdownForDonation(donorID, donationID) {
//   console.log('sourceDonation is ', donationID);
//   const donationRef = admin.firestore().collection('donor_master')
//       .doc(donorID).collection('donations').doc(donationID);
//   const poolRef = admin.firestore().collection('user_pool')
//       .where('sourceDonation', '==', donationID)
//       .where('sourceDonor', '==', donorID);
//   return poolRef.get().then((snap)=>{
//     if (snap.empty) return {learners: 0, countries: []};
//     let countries = [];
//     snap.forEach((doc)=>{
//       let data = doc.data();
//       let index = findObjWithProperty(countries, 'country', data.country)
//       if (index <0) {
//         countries.push({country: data.country, learnerCount: 1, regions: []});
//       } else {
//         countries[index].learnerCount++;
//       }
//       let regions = countries[index].regions;
//       let regIndex = findObjWithProperty(regions, 'region', data.region);
//       if (regIndex <0) {
//         countries[index].regions.push({region: data.region, learnerCount: 1});
//       } else {
//         countries[index].regions[regIndex].learnerCount++;
//       }
//     });
//     return {learners: snap.size, countries: countries};
//   }).then((res)=>{
//     return donationRef.update({learnerCount: res.learners,
//       countries: res.countries}
//     );
//   }).catch((err)=>{
//     console.error(err);
//   })
// }


// async function updateCountForCampaign(campaignID) {
//   let dbRef = admin.firestore().collection('campaigns');
//   return dbRef.where('campaignID', '==', campaignID).get().then((snap)=>{
//     if (snap.empty) {
//       throw new Error('could not find campaign with id: ', campaignID);
//     }
//     const doc = snap.docs[0];
//     let count = doc.data().learnerCount + 1;
//     return doc.ref.update({learnerCount: count}).catch((err)=>{
//       console.error(err);
//     })
//   }).catch((err)=>{
//     console.error(err);
//   });
// }

// function updateCountForRegion(country, region) {
//   console.log(country, region);
//   if (country === undefined) {
//     return new Promise((resolve)=>{
//       resolve('resolved');
//     });
//   }
//   if (region === undefined) {
//     region = 'no-region';
//   }
//   return admin.firestore().collection('loc_ref').doc(country)
//       .get().then((doc)=>{
//         const data = doc.data();
//         const newCount = data.learnerCount + 1;
//         let regions = data.regions;
//         let foundRegion = false;
//         for (const regionIndex in regions) {
//           if (regions[regionIndex] && regions[regionIndex].region === region) {
//             foundRegion = true;
//             regions[regionIndex].learnerCount++;
//             if (!regions[regionIndex].hasOwnProperty('pin') ||
//               (regions[regionIndex]['pin'].lat === 0 &&
//               regions[regionIndex]['pin'].lng === 0)) {
//               return getPinForAddress(country + ', ' + region).then((markerLoc) => {
//                 regions[regionIndex]['pin'] = {
//                   lat: markerLoc.lat,
//                   lng: markerLoc.lng,
//                 };
//                 return doc.ref.set({
//                   learnerCount: newCount,
//                   regions: regions,
//                 }, {merge: true}).catch((err)=>{
//                   console.error(err);
//                 });
//               });
//             }
//           }
//         }
//         if (!foundRegion) {
//           return getPinForAddress(country + ', ' + region).then((markerLoc) => {
//             console.log('--------------------- FOUND LOCATION: ' + markerLoc);
//             regions.push({
//               region: region,
//               pin: {
//                 lat: markerLoc.lat,
//                 lng: markerLoc.lng,
//               },
//               learnerCount: 1,
//               streetViews: {
//                 headingValues: [0],
//                 locations: [
//                 ],
//               },
//             });
//             return doc.ref.set({
//               learnerCount: newCount,
//               regions: regions,
//             }, {merge: true}).catch((err)=>{
//               console.error(err);
//             });
//           });
//         }
//         doc.ref.set({
//           learnerCount: newCount,
//           regions: regions,
//         }, {merge: true}).catch((err)=>{
//           console.error(err);
//         });
//         return newCount;
//       }).catch((err) => {
//         console.error(err);
//       });
// }

// function findObjWithProperty(arr, prop, val) {
//   for (let i=0; i < arr.length; i++) {
//     if (arr[i].hasOwnProperty(prop) && arr[i][prop] === val) {
//       return i;
//     }
//   }
//   return undefined;
// }
