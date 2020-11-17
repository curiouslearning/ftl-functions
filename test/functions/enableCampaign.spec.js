const test = require('firebase-functions-test')();
const sinon = require('sinon');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sandbox = require('sinon').createSandbox();

beforeEach(() => {
  adminInitStub.restore();
  adminInitStub = sinon.stub(admin, 'initializeApp');
});

afterEach(() => {
  adminInitStub.restore();
  sandbox.restore();
});

describe('functions/enableCampaign', async () => {
  const myFunction = require('../../functions/enableCampaign');
  const firestore = admin.firestore.Firestore;
  let snap;
  let context;
  let getStub;
  let updateStub;
  let wrapped;
  beforeEach(() => {
    snap = {
      data: () => {
        return {
          country: 'fake-country',
        };
      },
    };
    context = {
      params: {},
    };
    updateStub = sandbox.stub(firestore.DocumentReference.prototype, 'update');
    updateStub.returns(new Promise((res, rej)=>{resolve('success');}));
    getStub = sandbox.stub(firestore.Query.prototype, 'get');
    getStub.returns(new Promise((res, rej) => {
      let snap = {
        empty: false,
        docs: [],
      };
      snap.docs.push({
        id: 'fake-id',
        data: () => {
          return {
            country: 'fake-country',
            isVisible: false,
          };
        },
      });
      res(snap);
    }));
    wrapped = test.wrap(myFunction.enableCampaign);
  });
  afterEach(() => {
    sandbox.restore();
  });
  it('should not update if no campaigns are disabled', async () => {
    getStub.returns(new Promise((res, rej) =>{
      res({empty: true});
    }));
    const res = await wrapped(snap, context);
    updateStub.should.not.have.been.called;
  });
  it('should update on disabled campaigns matching the new user\'s country', async () => {
    const res = await wrapped(snap, context);
    res.should.deep.equal({
      status: 200,
      data: 'successfully re-enabled campaign: fake-country',
    });
  });
  it('should handle errors on bad data', async () => {
    getStub.rejects('Fake-Error', 'you failed!');
    const res = await wrapped(snap, context);
    res.should.deep.equal({
      status: 400,
      data: 'encountered error! Fake-Error: you failed!',
    });
  });
});
