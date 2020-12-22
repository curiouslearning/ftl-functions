const admin = require('firebase-admin');
const sandbox = require('sinon').createSandbox();
const proxyquire = require('proxyquire');

describe('functions/helpers/firebaseHelpers', () => {
  beforeEach(()=>{

  });

  afterEach(() => {
    sandbox.restore();
  });

  const myFunction = proxyquire('../../functions/helpers/firebaseHelpers', {'firebase-admin': admin});
  const {Client} = require('@googlemaps/google-maps-services-js');
  const firestore = admin.firestore.Firestore;
  const DocumentReference = admin.firestore.Firestore.DocumentReference;
  const nodemailer = require('nodemailer');
  describe('/getPinForAddress', async () => {
    let gmapsStub;
    let res;
    let errorObj;
    beforeEach(() => {
      res = {
        data: {
          results: [{
            geometry: {
              location: {
                lat: 1,
                lng: 1,
              },
            },
          }],
        },
      };
      errorObj = {
        response: {
          data: {
            error_message: 'fake-error',
          },
        },
      };
      gmapsStub = sandbox.stub(Client.prototype, 'geocode').resolves(res);
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should return {lat: 1, lng: 1}', async () => {
      const res = await myFunction.getPinForAddress('fake-address');
      res.should.deep.equal({
        lat: 1,
        lng: 1,
      });
    });
    it('should log an error', async () => {
      gmapsStub.rejects(errorObj);
      sandbox.spy(console, 'log');
      await myFunction.getPinForAddress('fake-address');
      console.log.should.have.been.calledWith('fake-error');
    });
  });
  describe('/updateCountForCampaign', async () => {
    let getStub;
    let updateStub;
    let campaign;
    let snapshot;
    beforeEach(() => {
      campaign = 'fake-campaign';
      updateStub = sandbox.stub().resolves();
      snapshot = {
        empty: false,
        docs: [{
          ref: {
            update: updateStub,
          },
          data: () => {
            return {
              learnerCount: 5,
            };
          },
        }],
      };
      getStub = sandbox.stub(firestore.Query.prototype, 'get');
      getStub.resolves(snapshot);
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should call update with a count of 6', async () => {
      await myFunction.updateCountForCampaign(campaign);
      updateStub.should.have.been.calledWith({
        learnerCount: 6,
      });
    });
    it('should log an error on a failed update', async () => {
      updateStub.rejects('fake-error');
      sandbox.spy(console, 'error');
      await myFunction.updateCountForCampaign(campaign);
      console.error.should.have.been.called;
    });
    it('should throw an error if no campaign was fetched', async () => {
      snapshot.empty = true;
      try {
        await myFunction.updateCountForCampaign(campaign);
      } catch (e) {
        e.message.should.equal('could not find campaign with id: fake-country');
      }
    });
    it('should log an error if query does not complete', async () => {
      getStub.rejects('fake-error');
      sandbox.spy(console, 'error');
      await myFunction.updateCountForCampaign(campaign);
      console.error.should.have.been.called;
    });
  });
  describe('/updateCountForRegion', async () => {
    let getStub;
    let doc;
    let setStub;
    let country;
    let region;
    beforeEach(() => {
      country = 'fake-country';
      region = 'fake-region';
      setStub = sandbox.stub().resolves();
      doc = {
        ref: {
          set: setStub,
        },
        data: () => {
          return {
            learnerCount: 50,
            regions: [{
              region: 'fake-region',
              learnerCount: 25,
              pin: {
                lat: 1,
                lng: 2,
              },
            }, {
              region: 'fake-region1',
              learnerCount: 25,
            }],
          };
        },
      };
      getStub = sandbox.stub(firestore.DocumentReference.prototype, 'get');
      getStub.resolves(doc);
      Client.prototype.geocode = sandbox.stub().resolves({
        data: {
          results: [{
            geometry: {
              location: {lat: 3, lng: 3},
            },
          }],
        },
      });
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should add 1 user to fake-region', async () => {
      await myFunction.updateCountForRegion(country, region);
      setStub.should.have.been.calledWith({
        learnerCount: 51,
        regions: [{
          region: 'fake-region',
          pin: {
            lat: 1,
            lng: 2,
          },
          learnerCount: 26,
        }, {
          region: 'fake-region1',
          learnerCount: 25,
        }],
      });
    });
    it('should add a pin and a user to fake-region 1', async () => {
      region = 'fake-region1';
      await myFunction.updateCountForRegion(country, region);
      setStub.should.have.been.calledWith({
        learnerCount: 51,
        regions: [{
          region: 'fake-region',
          pin: {
            lat: 1,
            lng: 2,
          },
          learnerCount: 25,
        }, {
          region: 'fake-region1',
          pin: {
            lat: 3,
            lng: 3,
          },
          learnerCount: 26,
        }],
      });
    });
    it('should generate a new region and increment the count', async () => {
      region = 'fake-region2';
      await myFunction.updateCountForRegion(country, region);
      setStub.should.have.been.calledWith({
        learnerCount: 51,
        regions: [{
          region: 'fake-region',
          learnerCount: 25,
          pin: {lat: 1, lng: 2},
        }, {
          region: 'fake-region1',
          learnerCount: 25,
        }, {
          region: 'fake-region2',
          learnerCount: 1,
          pin: {lat: 3, lng: 3},
          streetViews: {headingValues: [0], locations: []},
        }],
      });
    });
  });

  describe('/getCostPerLearner', async () => {
    let snapshot;
    let getStub;
    beforeEach(() => {
      snapshot = {
        empty: false,
        docs: [{
          data: () => {
            return {
              costPerLearner: 1,
            };
          },
        }],
      };
      getStub=sandbox.stub(firestore.Query.prototype, 'get').resolves(snapshot);
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should return the cost per learner', async () => {
      const res = await myFunction.getCostPerLearner('fake-campaign');
      res.should.equal(1);
    });
    it('should throw an error on empty snap', async () => {
      snapshot.empty = true;
      try {
        await myFunction.getCostPerLearner('fake-campaign');
      } catch (e) {
        e.message.should.equal('can\'t find campaign with ID: fake-campaign');
      }
    });
    it('should use the default CPL when none is available', async () => {
      snapshot = {
        empty: false,
        docs: [{
          data: () => {
            return {
              learnerCount: 1,
            };
          },
        }],
      };
      const res = await myFunction.getCostPerLearner('fake-campaign');
      res.should.equal(1);
    });
  });

  describe('/getDonorID', async () => {
    const auth = admin.auth();
    let authStub;
    let user;
    beforeEach(() => {
      user = {
        uid: 'fake-donor',
      };
      authStub = sandbox.stub(auth, 'getUserByEmail').resolves(user);
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should return a uid for the email', async () => {
      const res = await myFunction.getDonorID('fake@email.biz');
      res.should.equal('fake-donor');
    });
    it('should return the empty string', async () => {
      authStub.rejects({code: 'auth/user-not-found'});
      const res = await myFunction.getDonorID('fake@email.biz');
      res.should.equal('');
    });
    it('should throw an error', async () => {
      authStub.rejects(new Error('you failed'));
      try {
        await myFunction.getDonorID('fake@email.biz');
      } catch (e) {
        e.message.should.equal('Error: you failed');
      }
    });
  });

  describe('/getDonation', async () => {
    let getStub;
    let doc;
    beforeEach(() => {
      doc = {
        exists: true,
        id: 'fake-donation',
        data: () => {
          return {
            id: 'fake-donation',
            learnerCount: 1,
          };
        },
      };
      getStub = sandbox.stub(firestore.DocumentReference.prototype, 'get');
      getStub.resolves(doc);
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should return a doc with fake-donation', async () => {
      const res = await myFunction.getDonation('fake-donor', 'fake-donation');
      res.should.deep.equal({
        id: 'fake-donation',
        data: {
          id: 'fake-donation',
          learnerCount: 1,
        },
      });
    });
    it('should throw an error on a missing document', async () => {
      doc.exists = false;
      try {
        await myFunction.getDonation('fake-donor', 'fake-donation');
      } catch (e) {
        e.message.should.equal('fake-donor is missing Donation Document: fake-donation');
      }
    });
    it('should log any other errors', async () => {
      getStub.rejects('you failed!');
      sandbox.spy(console, 'error');
      await myFunction.getDonation('fake-donor', 'fake-donation');
      console.error.should.have.been.called;
    });
  });

  describe('/findObjWithProperty', async () => {
    let arr;
    let prop;
    let val;
    beforeEach(()=>{
      prop = 'prop';
      val = 'val';
      arr = [{prop: 'val'}];
    });
    afterEach(()=>{
      sandbox.restore();
    });
    it('should return 0', async () => {
      const index = myFunction.findObjWithProperty(arr, prop, val);
      index.should.equal(0);
    });
    it('should return -1', async () => {
      arr = [{
        property: 'val',
      }];
      const index = myFunction.findObjWithProperty(arr, prop, val);
      index.should.equal(-1);
    });
    it('should return 2', async () => {
      arr = [{
        property: 'val',
      }, {
        prop: 'value',
      }, {
        prop: 'val',
      }];
      const index = myFunction.findObjWithProperty(arr, prop, val);
      index.should.equal(2);
    });
    it('should throw an error', async () => {
      arr = 2;
      sandbox.spy(myFunction.findObjWithProperty);
      myFunction.findObjWithProperty(arr, prop, val);
      myFunction.findObjWithProperty.should.have.thrown;
    });
  });

  describe('/updateMasterLearnerCount', async () => {
    let getStub;
    let updateStub;
    let aggDoc;
    beforeEach(() => {
      aggDoc = {
        data: () => {
          return {
            allLearnersCount: 50,
            allLearnersWithDoNotTrack: 20,
          };
        },
      };
      getStub = sandbox.stub(firestore.DocumentReference.prototype, 'get');
      getStub.resolves(aggDoc);
      updateStub = sandbox.stub(firestore.DocumentReference.prototype, 'update');
      updateStub.resolves();
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('should call update with 51/21', async () => {
      await myFunction.updateMasterLearnerCount('no-country');
      updateStub.should.have.been.calledWith({
        allLearnersCount: 51,
        allLearnersWithDoNotTrack: 21,
      });
    });
    it('should call update with 51/20', async () => {
      await myFunction.updateMasterLearnerCount('fake-country');
      updateStub.should.have.been.calledWith({
        allLearnersCount: 51,
        allLearnersWithDoNotTrack: 20,
      });
    });
    it('should log an error', async () => {
      sandbox.spy(console, 'error');
      getStub.rejects('you failed');
      await myFunction.updateMasterLearnerCount('fake-country');
      console.error.should.have.been.called;
    });
  });
  describe('/sendEmail', async () => {
    let displayName;
    let email;
    let uid;
    let emailType;
    let docFake;
    let docStub;
    let transportStub;
    let transporter;
    beforeEach(() => {
      displayName= 'fake-firstName';
      email= 'fake@email.biz';
      uid = 'fake-donor';
      emailType = 'donationStart';
      transporter = {
        sendMail: sandbox.stub().callsArgWith(1, null, {response: 'email sent'}),
      };
      transportStub = sandbox.stub(nodemailer, 'createTransport')
      transportStub.returns(transporter);
      docFake = {
        data: () => {
          return {
            firstName: displayName,
            email: email,
          };
        },
      };
      docStub = sandbox.stub(DocumentReference.prototype, 'get')
      docStub.resolves(docFake);
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('should throw an error if the uid is missing', async () => {
      try {
        uid = '';
        sandbox.spy(myFunction, 'sendEmail');
        await myFunction.sendEmail(uid, emailType);
      } catch (err) {
        err.message.should.equal('a uid is required to send an email');
      }
      myFunction.sendEmail.should.have.thrown;
    });
    it('should log an error if it could not send the email', async () => {
      transporter.sendMail = sandbox.stub().callsArgWith(1, 'fake-error', null);
      sandbox.spy(console, 'error');
      await myFunction.sendEmail(uid, emailType);
      transporter.sendMail.should.have.been.called;
      console.error.should.have.been.called;
    });
    it('should log an error if given an unsupported type', async () => {
      try {
        emailType = 'fake-type';
        sandbox.spy(myFunction, 'sendEmail');
        await myFunction.sendEmail(uid, emailType);
      } catch (err) {
        err.message.should.equal(`email type ${emailType} is invalid. A valid email template must be used.`);
      }
      myFunction.sendEmail.should.have.thrown;
    });
  });
});
