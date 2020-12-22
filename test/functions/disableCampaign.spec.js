const test = require('firebase-functions-test')();
const proxyquire = require('proxyquire');
const admin = require('firebase-admin');
const sandbox = require('sinon').createSandbox();

describe('functions/disableCampaign', async () => {
  beforeEach(() => {

  });

  afterEach(() => {
    sandbox.restore();
  });

  const myFunction = proxyquire('../../functions/disableCampaign', {'firebase-admin': admin});
  const firestore = admin.firestore.Firestore;
  let before;
  let after;
  let context;
  let updateStub;
  let getStub;
  let wrapped;
  beforeEach(() => {
    before = {
      data: () => {
        return {
          userStatus: 'unassigned',
          country: 'fake-country',
          sourceCampaign: 'fake-campaign',
        };
      },
    };
    after = {
      data: () => {
        return {
          userStatus: 'assigned',
          country: 'fake-country',
          sourceCampaign: 'fake-campaign'
        };
      },
    };
    context = {
      params: {
        collection: 'user_pool',
        docID: 'fake-userID',
      },
    };
    updateStub = sandbox.stub(firestore.DocumentReference.prototype, 'update');
    updateStub.returns(new Promise((res) => {
      res('success');
    }));
    getStub = sandbox.stub(firestore.Query.prototype, 'get');
    getStub.returns(new Promise((res) => {
      res({size: 0});
    }));
    wrapped = test.wrap(myFunction.disableCampaign);
  });
  afterEach(() => {
    sandbox.restore();
  });
  it('should only run when a user has been assigned', async () => {
    after = {
      data: ()=>{
        return {
          userStatus: 'unassigned',
        };
      },
    };
    const change = test.makeChange(before, after);
    await wrapped(change, context);
    updateStub.should.not.have.been.called;
  });
  it('should not run if matching unassigned users are available', async () => {
    getStub.returns(new Promise((res) => {
      res({size: 3});
    }));
    const change = test.makeChange(before, after);
    await wrapped(change, context);
    updateStub.should.not.have.been.called;
  });
  it('should return a promise', async () => {
    const change = test.makeChange(before, after);
    const res = await wrapped(change, context);
    res.should.deep.equal({
      status: 200,
      data: 'successfully disabled fake-campaign',
    });
  });
  it('should throw an error on bad input', async () => {
    getStub.rejects('Fake-Error', 'you failed!');
    const change = test.makeChange(before, after);
    const res = await wrapped(change, context);
    res.should.deep.equal({
      status: 400,
      data: 'encountered error: Fake-Error: you failed!',
    });
  });
});
