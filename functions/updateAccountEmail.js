const https= require('https');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const auth = admin.auth();
const firestore = admin.firestore();

/* Force Update a user's primary account
* WARNING: This will delete the user in the authentication database,
* creating a new user with the new email address and the same unique identifier.
* Any authentication history (date created, last login, email verified, etc.)
* will be lost. This should only be used if the user was initialized with an
* invalid email address or is otherwise locked out of their account.
*/
exports.forceUpdateAccountEmail = functions.https.onRequest(async (req, res)=> {
  if (!req.body) {
    return res.status(400).send('no data provided!');
  }
  const params = req.body;
  if (!params.currentEmail) {
    return res.status(400).send('parameter "currentEmail" is required');
  } else if (!params.newEmail) {
    return res.status(400).send('parameter "newEmail" is required');
  }
  return auth.getUserByEmail(params.currentEmail).then((user) => {
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
