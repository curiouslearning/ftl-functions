const functions = require('firebase-functions');
const admin = require('firebase-admin');
if (!admin.app) {
  admin.initializeApp();
}
// if the last user for a country is removed from the pool, disable that
// country in the database
exports.disableCampaign = functions.firestore.document('/user_pool/{docID}')
    .onUpdate((change, context)=>{
      const before = change.before.data();
      const after = change.after.data();
      if (before.userStatus === 'unassigned' && after.userStatus !== 'unassigned') {
        return admin.firestore().collection('user_pool')
            .where('country', '==', after.country)
            .where('sourceCampaign', '==', after.sourceCampaign)
            .where('userStatus', '==', 'unassigned')
            .get().then((snap)=>{
              if (snap.size === 0) {
                const msgRef = admin.firestore().collection('campaigns')
                    .doc(after.sourceCampaign);
                msgRef.update({isVisible: false});
                return {status: 200, data: `successfully disabled ${after.sourceCampaign}`};
              }
              return new Promise((resolve)=>{
                resolve({status: 200, data: 'found learners'});
              });
            }).catch((err)=>{
              console.log(err);
              return {status: 400, data: `encountered error: ${err}`};
            });
      }
      return new Promise((res, rej)=>{
        res({status: 200, data: 'success'});
      });
    });
