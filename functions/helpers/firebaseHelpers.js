const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const mailConfig = require('../keys/nodemailerConfig.json');
const {Client, Status} = require('@googlemaps/google-maps-services-js');
const gmaps = new Client({});
const emailOptions = require('../config/email-options.json');
const DEFAULTCPL = 1;

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const getPinForAddress = (address) => {
    let markerLoc = {lat: 0, lng: 0};
    return gmaps.geocode({
        params: {
            address: address,
            key: 'AIzaSyDEl20cTMsc72W_TasuK5PlWYIgMrzyuAU',
        },
        timeout: 1000,
    }).then((r) => {
        if (r.data.results[0]) {
            markerLoc = r.data.results[0].geometry.location;
        }
        return markerLoc;
    }).catch((e) => {
        console.log(e.response.data.error_message);
    });
}

const updateCountForCampaign = (campaignID) => {
  let dbRef = admin.firestore().collection('campaigns');
  return dbRef.where('campaignID', '==', campaignID).get().then((snap)=>{
    if (snap.empty) {
      console.warn('could not find campaign with id: ', campaignID);
      return new Promise((res) => {
        res('resolved');
      });
    }
    const doc = snap.docs[0];
    let count = doc.data().learnerCount + 1;
    return doc.ref.update({learnerCount: count}).catch((err)=>{
      console.error(err);
    });
  }).catch((err)=>{
    console.error(err);
  });
}

const updateCountForRegion = (country, region) => {
    console.log(country, region);
    if (country === undefined) {
        return new Promise((resolve) => {
            resolve('resolved');
        });
    }
    region === undefined ? 'no-region' : region;

    return admin.firestore().collection('loc_ref').doc(country)
        .get().then((doc) => {
            const data = doc.data();
            const newCount = data.learnerCount + 1;
            let regions = data.regions;
            let foundRegion = false;
            for (const regionIndex in regions) {
                if (regions[regionIndex] && regions[regionIndex].region === region) {
                    foundRegion = true;
                    regions[regionIndex].learnerCount++;
                    if (!regions[regionIndex].hasOwnProperty('pin') ||
                        (regions[regionIndex]['pin'].lat === 0 &&
                            regions[regionIndex]['pin'].lng === 0)) {
                        return getPinForAddress(country + ', ' + region).then((markerLoc) => {
                            regions[regionIndex]['pin'] = {
                                lat: markerLoc.lat,
                                lng: markerLoc.lng,
                            };
                            return doc.ref.set({
                                learnerCount: newCount,
                                regions: regions,
                            }, {merge: true}).catch((err) => {
                                console.error(err);
                            });
                        });
                    }
                }
            }
            if (!foundRegion) {
                return getPinForAddress(country + ', ' + region).then((markerLoc) => {
                    console.log('--------------------- FOUND LOCATION: ' + markerLoc);
                    regions.push({
                        region: region,
                        pin: {
                            lat: markerLoc.lat,
                            lng: markerLoc.lng,
                        },
                        learnerCount: 1,
                        streetViews: {
                            headingValues: [0],
                            locations: [],
                        },
                    });
                    return doc.ref.set({
                        learnerCount: newCount,
                        regions: regions,
                    }, {merge: true}).catch((err) => {
                        console.error(err);
                    });
                });
            }
            doc.ref.set({
                learnerCount: newCount,
                regions: regions,
            }, {merge: true}).catch((err) => {
                console.error(err);
            });
            return newCount;
        }).catch((err) => {
            console.error(err);
        });
}

const calculatePercentFilled = (amount, costPerLearner, learnerCount) => {
  const learnerMax = Math.round(amount/costPerLearner);
  const decimal = learnerCount/learnerMax;
  return Math.round(decimal * 100);
};

const getCostPerLearner = (campaignID) => {
  return admin.firestore().collection('campaigns')
      .where('campaignID', '==', campaignID)
      .get().then((snap)=>{
        if (snap.empty) {
          throw new Error('can\'t find campaign with ID: ', campaignID);
        }
        if (!snap.docs[0].data().costPerLearner) {
          console.warn(`${campaignID} has no cost per learner associated!`);
          console.warn('using default cost per learner');
          return DEFAULTCPL;
        }
        return snap.docs[0].data().costPerLearner;
      }).catch((err)=>{
        console.error(err);
      });
};

const getOrCreateDonor = (params) => {
  return getDonorID(params.email).then((foundID)=>{
    if (foundID === '') {
      console.log('creating new donor: ', params.email);
      return createDonor(params);
    } else {
      return foundID;
    }
  }).catch((err)=>{
    console.error(err);
  });
};

const createDonor = function(params) {
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

const getDonorID = (email) => {
  return admin.auth().getUserByEmail(email)
      .then((user)=>{
        return user.uid;
      }).catch((err)=>{
        if (err.code === 'auth/user-not-found') {
          console.log('No Donor found for email: ', email);
          return '';
        } else throw new Error(err);
      });
};

const getDonation = (donorID, donationID) => {
  return admin.firestore().collection('donor_master').doc(donorID)
      .collection('donations').doc(donationID)
      .get().then((doc)=>{
        if (!doc.exists) {
          throw new Error(
              donorID,
              ' is missing Donation Document: ',
              donationID,
          );
        }
        return {id: doc.id, data: doc.data()};
      }).catch((err)=>{
        console.error(err);
      });
};

const findObjWithProperty = (arr, prop, val) => {
  for (let i=0; i < arr.length; i++) {
    if (arr[i].hasOwnProperty(prop) && arr[i][prop] === val) {
      return i;
    }
  }
  return -1;
};

const updateMasterLearnerCount = (country) => {
  const msgRef = admin.firestore().collection('aggregate_data').doc('data');
  return msgRef.get().then((doc)=>{
    let count = doc.data().allLearnersCount + 1;
    let noCountry = doc.data().allLearnersWithDoNotTrack;
    if (country === 'no-country') {
      noCountry++;
    }
    return msgRef.update({
      allLearnersCount: count,
      allLearnersWithDoNotTrack: noCountry,
    });
  }).catch((err)=>{
    console.error(err);
  });
};

/**
* Send an automated email of type emailType to the donor specified by uid
* @param{String} uid the unique identifier of the target donor
* @param{String} emailType the key for the desired email template
* @return{Promise} A promise that resolves if the email successfully sends
*/
const sendEmail = async (uid, emailType) => {
  if (!uid || uid === '') {
    throw new Error('a uid is required to send an email');
  }
  if (!emailType || !emailOptions.hasOwnProperty(emailType)) {
    throw new Error(`email type ${emailType} is invalid. A valid email template must be used.`);
  }
  const usrRef = admin.firestore().collection('donor_master').doc(uid);
  const emailConfig = emailOptions[emailType];
  let url = 'https://followthelearners.curiouslearning.org/campaigns';
  if (emailConfig.utm_source) {
    url = url.concat(emailConfig.utm_source);
  }
  const actionCodeSettings = {
    url: url,
    handleCodeInApp: true,
  };
  const transporter = nodemailer.createTransport(mailConfig);
  return usrRef.get().then((doc)=>{
    const data = doc.data();
    const firstName = data.firstName;
    const email = data.email;
    const capitalized = firstName.charAt(0).toUpperCase();
    const formattedName = capitalized + firstName.slice(1);
    const textConfigOptions = {
      url: 'followthelearners.curiouslearning.org/',
      formattedName: formattedName,
    };
    if (emailConfig.utm_source) {
      textConfigOptions.url = textConfigOptions.url + emailConfig.utm_source;
    }
    emailText = customizeText(emailConfig.text, textConfigOptions);
    const mailOptions = {
      from: emailConfig.from,
      to: email,
      subject: emailConfig.subject,
      text: emailText,
    };
    return transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(error);
        return;
      } else {
        console.log('email sent: ' + info.response);
        return;
      }
    });
  }).catch((err) => {
    console.error(err);
  });
};

const customizeText = (text, configOptions) => {
  for (prop in configOptions) {
    if (configOptions[prop]) {
      text = text.replace('${'+prop+'}', configOptions[prop]);
    }
  }
  return text;
};

module.exports = {
  getPinForAddress,
  updateCountForRegion,
  updateCountForCampaign,
  updateMasterLearnerCount,
  calculatePercentFilled,
  getOrCreateDonor,
  findObjWithProperty,
  getDonation,
  getDonorID,
  getCostPerLearner,
  sendEmail,
  customizeText,
};
