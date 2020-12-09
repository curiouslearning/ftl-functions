const functions = require('firebase-functions');
const admin = require('firebase-admin');
const logDonation = require('./logDonation');
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const DEFAULTCPL = 1.0;

// create a dummy payment_intent object and send it through the system
exports.testPaymentIntent = functions.https.onRequest(async (req, res) => {
  const event = {
    id: 'fake-event-id',
    data: {
      object: {
        description: 'Give Lively / Smart Donations',
        amount: 2076,
        metadata: {
          transaction_fee_covered_by_donor: '$0.76',
          user_email: 'fake@email.biz',
          user_first_name: 'fakeName',
          utm_source: 'Africa|Africa|fakeReferral',
        },
      },
    },
  };
  console.log('testing donation pathway');
  const msg = this.handlePaymentIntentSucceeded(event.data.object, event.id);
  return res.status(200).send({msg: msg, obj: event});
});

exports.logPaymentIntent = functions.https.onRequest(async (req, res) => {
  const event = req.body;
  if (!req.body) {
    return res.status(400).send('no data supplied!');
  }
  console.log(`parsing event with id ${event.id}`);
  let intent;
  let msg;
  switch (event.type) {
    case 'payment_intent.succeeded':
      intent = event.data.object;
      if (paymentIntent.description === 'Give Lively / Smart Donations') {
        console.log(`successful payment for ${intent.amount}`);
        msg = this.handlePaymentIntentSucceeded(intent, event.id);
      }
      break;
  }
  if (msg.data.err) { // check to see if the data were successfully parsed
    res.status(500);
  } else {
    res.status(200);
  }
  return res.send({msg: msg, obj: event});
});

exports.handlePaymentIntentSucceeded = async (intent, id) => {
  let metadata;
  let amount = intent.amount/100; // convert from cents to dollars
  try {
    metadata = intent.metadata;
    let coveredByDonor = metadata.transaction_fee_covered_by_donor;
    if (coveredByDonor) {
      coveredByDonor = Number(coveredByDonor.replace('$', ''));
      amount = amount - coveredByDonor;
    }
    const splitString = (metadata.utm_source||'').split('|');
    const campaignID = splitString[0] || 'MISSING';
    const country = splitString[1] || 'MISSING';
    const referralSource = splitString[2] || 'MISSING';
    const email = metadata.user_email;
    const firstName = metadata.user_first_name;
    const uid = await helpers.getOrCreateDonor(email);
    const params = {
      stripeEventId: id,
      firstName: firstName,
      email: email,
      amount: amount,
      coveredByDonor: coveredByDonor,
      campaignID: campaignID,
      country: country,
      sourceDonor: uid,
      referralSource: referralSource,
      frequency: 'one-time',
    };
    console.log(`user is ${uid}`);
    console.log('campaign is', params.campaignID);
    console.log('country is', params.country);
    console.log('referral is', params.referralSource);
    for (param in params) {
      if (params[param] && params[param] === 'MISSING') {
        params['needsAttention'] = true;
        console.warn(`event ${id} is missing param ${param}`);
      } else if (!params[param]) {
        params[param] = 'MISSING';
        params['needsAttention'] = true;
        console.warn(`event ${id} is missing param ${param}`);
      }
    }
    logDonation.writeDonation(params); // kick off the asynchronous write
    return {msg: 'successfully handled intent', data: {uid: sourceDonor}};
  } catch (err) {
    const data = {id: id, err: err};
    console.error(`error handling payment intent with id ${id}: ${err}`);
    return {msg: 'could not handle payment', data: msg};
  }
};
