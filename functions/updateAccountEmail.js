const https= require('https');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const auth = admin.auth();
const firestore = admin.firestore();

exports.updateAccountEmail = functions.https.onRequest(async (req, res) => {
  if (!req.body) {
    return res.status(400).send('no data provided!');
  }
  const params = req.body;
  if (!params.currentEmail) {
    return res.status(400).send('parameter "currentEmail" is required');
  } else if (!params.newEmail) {
    return res.status(400).send('parameter "newEmail" is required');
  }
  await auth.getUserByEmail(params.currentEmail).then((user) => {
    const uid = user.uid;
    return auth.deleteUser(uid).then(() => {
      const updateDoc = firestore.collection('donor_master').doc(uid)
          .get().then((doc)=>{
            if (!doc.exists) {
              //throw error
              return;
            }
            return doc.update({email: params.newEmail});
          });
      const updateAuth = auth.createUser({
        uid: uid,
        email: params.newEmail,
      });
      return Promise.all([updateDoc, updateAuth]).then((vals)=>{
        return res.status(200)
            .send(`updated ${uid} with email: ${params.newEmail}`);
      }).catch((err) => {
        return res.status(500).send({
          msg: `could not update ${uid} with email: ${email}.`,
          err: err,
        });
      });
    });
  }).catch((err) => {
    console.error(err);
    switch (err.code) {
      case 'auth/invalid-email':
        return res.status(400)
            .send(`could not find user with email: ${params.currentEmail}`);
      default:
        return res.status(500)
          .send({msg: `could not update user with email ${params.currentEmail}`,
            err: err
          });
    }
  });
});
