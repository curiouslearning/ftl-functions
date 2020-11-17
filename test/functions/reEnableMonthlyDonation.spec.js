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

describe('functions/reEnableMonthlyDonation', async () => {
  const myFunction = require('../../functions/reEnableMonthlyDonation');
  const firestore = admin.firestore.Firestore;
  let before;
  let after;
  let context;
  let updateStub;
  let deleteStub;
  let wrapped;
  beforeEach(() => {
    before = {
      data: () => {
        return {
          percentFilled: 30,
        };
      },
    };
    after = {
      data: () => {
        return {
          percentFilled: 60,
        };
      },
      ref: {
        update: sinon.fake(()=>{return new Promise((res)=>{return res(1);});}),
      },
    };
    context = {};
    updateStub = sandbox.stub(firestore.DocumentReference.prototype, 'update');
    updateStub.returns(new Promise((res)=>{
      return res(1);
    }));
    deleteStub = sandbox.stub(admin.firestore.FieldValue, 'delete');
    deleteStub.returns('deleted');
    wrapped = test.wrap(myFunction.reEnableMonthlyDonation);
  });
  afterEach(() => {
    sandbox.restore();
  });
  it('should not run if percentFilled is increased', async () => {
    const change = test.makeChange(before, after);
    const res = await wrapped(change, context);
    after.ref.update.should.not.have.been.called;
  });
  it('should run if percentFilled has decreased', async () => {
    before = {
      data: () => {
        return {
          percentFilled: 100,
        };
      },
    };
    const change = test.makeChange(before, after);
    await wrapped(change, context);
    after.ref.update.should.have.been.calledWith({endDate: 'deleted'});
  });
  it('should return an error', async () => {
    before = {
      data: () => {
        return {
          percentFilled: 100,
        };
      },
    };
    after.ref.update = sandbox.fake(()=>{
      return new Promise((res, rej)=>{
        rej(new Error('you failed!'));
      });
    });
    const change = test.makeChange(before, after);
    const res = await wrapped(change, context);
    res.should.deep.equal({
      status: 501,
      data: 'encountered an error! Error: you failed!',
    });
  });
});
