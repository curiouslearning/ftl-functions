const test = require('firebase-functions-test')();
const admin = require('firebase-admin');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const cloneDeep = require('lodash/cloneDeep');
const stubbedAdmin = cloneDeep(admin);
let sandbox;

describe('functions/checkForDonationEndDate', async () => {
  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });
  const myFunction = proxyquire('../../functions/checkForDonationEndDate', {'firebase-admin': stubbedAdmin});
  let before;
  let after;
  let context;
  let setStub;
  let wrapped;
  beforeEach(() => {
    before = {
      data: ()=>{
        return {
          percentFilled: 50,
        };
      },
    };
    after = {
      data: ()=>{
        return {
          percentFilled: 100,
        };
      },
    };
    context = {
      params: {
        donorId: 'fake-donor',
        documentId: 'fake-doc',
      },
    };
    setStub = sandbox.stub(stubbedAdmin.firestore.Firestore.DocumentReference.prototype, 'set');
    setStub.resolves();
    spy = sandbox.spy(myFunction.checkForDonationEndDate);
    wrapped = test.wrap(myFunction.checkForDonationEndDate);
    staticTime = stubbedAdmin.firestore.Firestore.Timestamp.now();
    timeStub = sandbox.stub(stubbedAdmin.firestore.Firestore.Timestamp, 'now');
    timeStub.returns(staticTime);
  });

  afterEach(() => {
    sandbox.restore();
  });
  it('should only run if the donation is full', async () => {
    after = {data: ()=>{return {percentFilled: 90};}};
    const change = test.makeChange(before, after);
    wrapped(change, context);
    setStub.should.not.have.been.called;
  });
  it('should only run if there is no endDate field', async () => {
    after= {
      data: ()=>{
        return {
          percentFilled: 100,
          endDate: stubbedAdmin.firestore.Firestore.Timestamp.now(),
        };
      },
    };
    const change = test.makeChange(before, after);
    wrapped(change, context);
    setStub.should.not.have.been.called;
  });
  it('should add a valid firestore timestamp to the document', async () => {
    const change = test.makeChange(before, after);
    const res = await wrapped(change, context);
    res.should.deep.equal({
      status: 200,
      data: {
        percentFilled: 100,
        endDate: staticTime,
      },
    });
  });
  it('should throw an error if the document is malformed', async () => {
    setStub.rejects('Fake-Error', 'you failed!');
    const change = test.makeChange(before, after);
    const res = await wrapped(change, context);
    res.should.deep.equal({
      status: 400,
      data: 'encountered an error and could not continue: Fake-Error: you failed!',
    });
  });
});
