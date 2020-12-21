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
// TODO: Figure out why Mocha won't run these tests...
describe('functions/onDonationIncrease', async () => {
  const myFunction = require('../../functions/onDonationIncrease');
  const firestore = admin.firestore.Firestore;
  let before;
  let after;
  let context;
  let campaignDoc;
  let updateStub;
  let getStub;
  let wrapped;
  let helperStub;
  beforeEach(() => {
    before = {
      data: () => {
        return {
          amount: 5,
          percentFilled: 100,
          campaignID: 'fake-campaign',
          sourceDonor: 'fake-donor',
          learnerCount: 20,
          costPerLearner: 0.25,
          endDate: admin.firestore.Firestore.Timestamp.now(),
        };
      },
    };

    after = {
      data: () => {
        return {
          amount: 10,
          percentFilled: 100,
          campaignID: 'fake-campaign',
          sourceDonor: 'fake-donor',
          learnerCount: 20,
          costPerLearner: 0.25,
          endDate: admin.firestore.Firestore.Timestamp.now(),
        };
      },
    };

    context = {
      params: {
        donationId: 'fake-donation',
      },
    };

    campaignDoc = {
      id: 'fake-campaign',
      data: () => {
        return {
          campaignID: 'fake-campaign',
          costPerLearner: 0.25,
        };
      },
    };
    updateStub = sandbox.stub(firestore.DocumentReference.prototype, 'update');
    updateStub.returns(new Promise((res, rej)=>{
      res('success');
    }));
    wrapped = test.wrap(myFunction.onDonationIncrease);
    getStub = sandbox.stub(firestore.Query.prototype, 'get');
    getStub.returns(new Promise((res, rej)=>{
      res({
        docs: [campaignDoc],
      });
    }));
    helperStub = sandbox.stub(myFunction, 'updatePercentFilled');
  });
  afterEach(() => {
    sandbox.restore();
  });
  it('should return a 501 error', async () => {
    helperStub.restore();
    updateStub.rejects('Fake-Error', 'you failed!');
    const change = test.makeChange(before, after);
    const res = await wrapped(change, context);
    res.should.deep.equal({
      status: 501,
      data: 'encountered an error! Fake-Error: you failed!',
    });
  });
  it('should run when donation is increased', async () => {
    const change = test.makeChange(before, after);
    await wrapped(change, context);
    helperStub.should.have.been.calledOnce;
  });
  it('should not run when donation is unchanged', async () => {
    after = {
      data: () => {
        return {
          amount: 5,
          percentFilled: 100,
          costPerLearner: 0.25,
          learnerCount: 20,
        };
      },
    };
    const change = test.makeChange(before, after);
    await wrapped(change, context);
    helperStub.should.not.have.been.called;
  });
  it('should run if no percentFilled field exists', async () => {
    after = {
      data: () => {
        return {
          after: 5,
        };
      },
    };
    const change = test.makeChange(before, after);
    await wrapped(change, context);
    helperStub.should.have.been.calledOnce;
  });
  it('should accurately update the percentFilled field', async () => {
    helperStub.restore();
    const change = test.makeChange(before, after);
    const res = await wrapped(change, context);
    res.should.equal('success');
  });
});
