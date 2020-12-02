const functions = require('firebase-functions');
const admin = require('firebase-admin');
const logDonation = require('./logDonation');
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const DEFAULTCPL = 1.0;

exports.logPaymentIntent = functions.https.onRequest(async (req, res) => {
  if (!req.body) {
    res.status(501).send('no data supplied!');
    return;
  }
  let event;
  try {
    event = req.body;
  } catch (err) {
    console.log(`encountered error while parsing request: ${err}`);
    res.status(501).send({msg: 'bad data supplied', data: req.body});
    return;
  }
  console.log(`parsing event with id ${event.id}`);
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      if (paymentIntent.description === 'Give Lively/ Smart Donations') {
        console.log(`successful payment for ${paymentIntent.amount}`);
        this.handlePaymentIntentSucceeded(paymentIntent, event.id);
      }
      break;
    default:
      // ignore other events
      break;
  }
  res.status(200).send({msg: 'sucessfully received event', data: event});
  return;
});

exports.handlePaymentIntentSucceeded = async (intent, id) => {
  let metadata;
  let amount = intent.amount/100; // convert from cents to dollars
  try {
    metadata = intent.metadata;
    let coveredByDonor = metadata.transaction_fee_covered_by_donor;
    if (coveredByDonor) {
      coveredByDonor = Number(coveredByDonor.replace('$'));
      amount = amount - coveredByDonor;
    }
    const splitString = metadata.utm_source.split('|');
    const email = metadata.user_email;
    const firstName = metadata.user_first_name;
    const campaignID = splitString[0] || 'MISSING';
    const country = splitString[1] || 'MISSING';
    const referralSource = splitString[2] || 'MISSING';
    const donationObject = {
      firstName: firstName,
      email: email,
      amount: amount,
      coveredByDonor: coveredByDonor,
      campaignID: campaignID,
      country: country,
      referralSource: referralSource,
    };
    for (param in donationObject) {
      if (params[param] && params[param] === 'MISSING') {
        params['needsAttention'] = true;
      } else if (!params[param]) {
        params[param] = 'MISSING';
        params['needsAttention'] = true;
      }
    }
    logDonation.writeDonation(donationObject);
  } catch (err) {
    console.error(`error handling payment intent with id ${id}: ${err}`);
  }
};
