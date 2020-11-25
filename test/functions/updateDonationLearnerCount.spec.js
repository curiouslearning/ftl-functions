const test = require('firebase-functions-test')();
const sinon = require('sinon');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sandbox = require('sinon').createSandbox();

beforeEach(()=>{
  adminInitStub.restore();
  adminInitStub = sinon.stub(admin, 'initializeApp');
});
afterEach(() => {
  adminInitStub.restore();
  sinon.restore();
});

describe('functions/updateDonationLearnerCount', async () => {
  const myFunction = require('../../functions/updateDonationLearnerCount');
  const firestore = admin.firestore.Firestore;
  describe('functions/updateDonationLearnerCount/updateDonationLearnerCount', async() => {
    let before;
    let after;
    let context;
    let wrapped;
    let helperStub;
    let updateStub;
    let getStub;
    beforeEach(() => {
      before = {
        data: () => {
          return {
            userStatus: 'unassigned',
          };
        },
      };
      after = {
        data: () => {
          return {
            userStatus: 'assigned',
            sourceDonor: 'fake-donor',
            sourceDonation: 'fake-donation',
          };
        },
      };
      context = {};
      wrapped = test.wrap(myFunction.updateDonationLearnerCount);
      helperStub = sandbox.stub(myFunction, 'updateLocationBreakdownForDonation');
      helperStub.returns(new Promise((res)=>{return res(1);}));
      updateStub = sandbox.stub(firestore.DocumentReference.prototype, 'update');
      getStub = sandbox.stub(firestore.Query.prototype, 'get');
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should return a Promise', async () => {
      const change = test.makeChange(before, after);
      const res = await wrapped(change, context);
      res.should.equal(1);
    });
    it('should not update if the user is expired', async () => {
      after = {
        data: () => {
          return {
            userStatus: 'expired',
          };
        },
      };
      const change = test.makeChange(before, after);
      await wrapped(change, context);
      helperStub.should.not.have.been.called;
    });
    it('should return with 200 status', async () => {
      after = {
        data: () => {
          return {
            userStatus: 'expired',
          };
        },
      };
      const change = test.makeChange(before, after);
      const res = await wrapped(change, context);
      res.should.deep.equal({
        status: 200,
        data: 'no operation necessary',
      });
    });
    it('should throw an error if data are missing', async () => {
      const after = {
        data: () => {
          return {
            userStatus: 'assigned',
          };
        },
      };
      const change = test.makeChange(before, after);
      const res = await wrapped(change, context);
      res.should.deep.equal({
        status: 501,
        data: 'encountered an error! Error: missing key donation information',
      });
    });
  });
  describe('function/updateDonationLearnerCount/updateLocationBreakdownForDonation', async () => {
    let donation = 'fake-donation';
    let donor = 'fake-donor';
    let updateStub;
    let getStub;
    let snapshot;
    beforeEach(()=> {
      snapshot = {
        empty: false,
        docs: [{
          id: 'fake-user',
          data: () => {
            return {
              userID: `fake-user`,
              sourceDonor: 'fake-donor',
              sourceDonation: 'fake-donation',
              country: 'fake-country',
              region: 'fake-region',
            };
          },
        }],
        forEach: function(callback) {
          this.docs.forEach((doc)=>{
            callback(doc);
          });
        },
        get size() {
          return this.docs.length;
        },
      };
      for (let i=0; i <399; i++) {
        snapshot.docs.push({
          id: `fake-user-${i}`,
          data: () =>{
            return {
              userID: `fake-user-${i}`,
              sourceDonor: 'fake-donor',
              sourceDonation: 'fake-donation',
              country: 'fake-country',
              region: 'fake-region',
            };
          },
        });
      }
      updateStub= sandbox.stub(firestore.DocumentReference.prototype, 'update');
      updateStub.resolves();
      getStub = sandbox.stub(firestore.Query.prototype, 'get');
      getStub.returns(new Promise((res)=>{
        return res(snapshot);
      }));
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should reflect a count of 400 in one country', async () => {
      updateStub.resolvesArg(0);
      const res = await myFunction.updateLocationBreakdownForDonation(donor, donation);
      res.should.deep.equal({
        learnerCount: 400,
        countries: [{
          country: 'fake-country',
          learnerCount: 400,
          regions: [{
            region: 'fake-region',
            learnerCount: 400,
          }],
        }],
      });
    });
    it('should reflect a count of 0', async () => {
      snapshot.empty = true;
      updateStub.resolvesArg(0);
      const res = await myFunction.updateLocationBreakdownForDonation(donor, donation);
      res.should.deep.equal({
        learnerCount: 0,
        countries: [],
      });
    });
    it('should accurately count regions in their proper countries', async ()=>{
      snapshot.docs = [];
      for (let i = 0; i < 400; i++) {
        let id = `fake-id-${i}`;
        let country;
        let region;
        const iMod = 400%i;
        if (iMod === 0) {
          country = 'fake-country-1';
          region = 'fake-country-1-region-1';
        } else if (iMod ===1) {
          country = 'fake-country-2';
          region = 'fake-country-2-region-1';
        } else if (iMod === 2) {
          country = 'fake-country-1';
          region = 'fake-country-1-region-2';
        } else {
          country = 'fake-country-2';
          region = 'fake-country-2-region-2';
        }
        snapshot.docs.push({
          id: id,
          data: () => {
            return {
              userID: id,
              sourceDonor: 'fake-donor',
              sourceCampaign: 'fake-campaign',
              country: country,
              region: region,
            };
          },
        });
      }
      updateStub.resolvesArg(0);
      const res = await myFunction.updateLocationBreakdownForDonation(donor, donation)
      res.should.deep.equal({
        learnerCount: 400,
        countries: [{
          country: 'fake-country-2',
          learnerCount: 384,
          regions: [{
            region: 'fake-country-2-region-2',
            learnerCount: 377,
          }, {
            region: 'fake-country-2-region-1',
            learnerCount: 7,
          }],
        }, {
          country: 'fake-country-1',
          learnerCount: 16,
          regions: [{
            region: 'fake-country-1-region-1',
            learnerCount: 14,
          }, {
            region: 'fake-country-1-region-2',
            learnerCount: 2,
          }],
        }],
      });
    });
    it('should return an error message', async () => {
      updateStub.throws('FakeError', 'you failed!');
      const res = await myFunction.updateLocationBreakdownForDonation(donor, donation);
      res.should.deep.equal({
        status: 501,
        data: 'encountered an error! FakeError: you failed!',
      });
    });
  });
});
