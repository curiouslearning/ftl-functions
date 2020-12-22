const test = require('firebase-functions-test')();
const admin = require('firebase-admin');
const helpers = require('../../functions/helpers/firebaseHelpers');
const proxyquire = require('proxyquire');
let sinon = require('sinon');
let sandbox;

describe('functions/onNewUser', async () => {
    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

  const myFunction = proxyquire('../../functions/onNewUser', {'firebase-admin': admin});
  const firestore = admin.firestore.Firestore;
  let snap;
  let context;
  let updateMasterCountStub;
  let updateRegionsStub;
  let updateCampaignStub;
  let updateStub;
  let wrapped;
  beforeEach(() => {
    snap = {
      id: 'fake-user',
      data: () => {
        return {
          userID: 'fake-user',
          country: 'fake-country',
          region: 'fake-region',
          dateCreated: firestore.Timestamp.now(),
          userStatus: 'unassigned',
          sourceCampaign: 'fakeCampaign',
          sourceDonor: 'unassigned',
          learnerLevel: 'first-open',
          countedInMasterCount: false,
          countedInCampaign: false,
          countedInRegion: false,
        };
      },
      ref: {
        update: () => {
          return new Promise((res)=>{
            return res(sinon.fake());
          });
        },
      },
    };
    context = {
      params: {
        docId: 'fake-user',
      },
    };
    updateMasterCountStub = sandbox.stub(helpers, 'updateMasterLearnerCount');
    updateRegionsStub = sandbox.stub(helpers, 'updateCountForRegion');
    updateCampaignStub = sandbox.stub(helpers, 'updateCountForCampaign');
    updateStub = sandbox.stub(firestore.DocumentReference.prototype, 'update');
    wrapped = test.wrap(myFunction.onNewUser);
  });
  afterEach(() => {
    sandbox.restore();
  });
  it('should throw a missing argument error', async () => {
    updateCampaignStub.throws('Argument-Error', 'missing argument');
    const res = await wrapped(snap, context);
    res.should.deep.equal({
      status: 501,
      data: 'encountered an error! Argument-Error: missing argument',
    });
  });
  it('should return a message on success', async () => {
    const res = await wrapped(snap, context);
    res.should.deep.equal({
      status: 200,
      data: 'fake-user successfully counted',
    });
  });
  it('should not run if user is already counted', async () => {
    snap = {
      id: 'fake-user',
      data: () => {
        return {
          countedInCampaign: true,
          countedInMasterCount: true,
          countedInRegion: true,
        };
      },
    };
    const res = await wrapped(snap, context);
    res.should.deep.equal({
      status: 200,
      data: 'fake-user is already counted',
    });
  });
});
