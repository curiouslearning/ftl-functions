const sinon = require('sinon');
const admin = require('firebase-admin');
const PassThrough = require('stream').PassThrough;
const http = require('http');
const sandbox = require('sinon').createSandbox();
const proxyquire = require('proxyquire');

describe('functions/logDonation', async () => {
    beforeEach(()=>{
    });

    afterEach(()=>{
        sandbox.restore();
    });

  const helpers = require('../../functions/helpers/firebaseHelpers');
  const assignLearners = require('../../functions/helpers/assignLearners');
  const myFunction= proxyquire('../../functions/logDonation', {'firebase-admin': admin});
  const auth = admin.auth();
  const firestore = admin.firestore.Firestore;
  describe('functions/logDonation/logDonation', ()=>{
    const firestore = admin.firestore.Firestore;
    let docStub;
    let writeStub;
    let getOrCreateStub;
    let status;
    let send;
    let res;
    let run;
    beforeEach(()=>{
      status = sandbox.stub();
      send = sandbox.spy();
      res = {send, status};
      status.returns(res);
      writeStub = sandbox.stub(myFunction, 'writeDonation');
      this.request = sandbox.stub(http, 'request');
      sandbox.spy(console, 'error');
      docStub = {
        body: {
          firstName: 'fake-firstName',
          email: 'fake@email.biz',
          amount: '5.45',
          coveredByDonor: '0.45',
          campaignID: 'fake-campaign|fake-country|fake-referral',
          frequency: 'one-time',
        },
      };
      getOrCreateStub = sandbox.stub(helpers, 'getOrCreateDonor');
      getOrCreateStub.resolves('fake-donor');
      run = async () =>{
        const request = new PassThrough();
        sandbox.stub(request, 'write');
        this.request.returns(request);
        return await myFunction.logDonation(docStub, res);
      };
    });
    afterEach(()=>{
      sandbox.restore();
    });
    it('should accept a POST request with args', async ()=>{
      writeStub.resolves();
      const stubTime = firestore.Timestamp.now();
      sandbox.stub(firestore.Timestamp, 'now').returns(stubTime);
      await run();
      writeStub.should.have.been.calledWith({
        firstName: 'fake-firstName',
        email: 'fake@email.biz',
        amount: 5,
        frequency: 'one-time',
        campaignID: 'fake-campaign',
        country: 'fake-country',
        referralSource: 'fake-referral',
        sourceDonor: 'fake-donor',
      });
      res.status.should.have.been.calledWith(200);
    });
    it('should return an error', async () => {
      writeStub.rejects('FakeError', 'you failed');
      await run();
      console.error.should.have.been.called;
    });
    it('should safely handle malformed data and flag the document', async ()=>{
      writeStub.resolves();
      docStub.body.campaignID = '';
      docStub.body.amount ='s';
      const stubTime = firestore.Timestamp.now();
      sandbox.stub(firestore.Timestamp, 'now').returns(stubTime);
      await run();
      writeStub.should.have.been.calledWith(sinon.match({
        firstName: 'fake-firstName',
        email: 'fake@email.biz',
        amount: 'MISSING',
        frequency: 'one-time',
        campaignID: 'MISSING',
        country: 'MISSING',
        referralSource: 'MISSING',
        needsAttention: true,
        sourceDonor: 'fake-donor',
      }));
    });
    it('should throw an error', async ()=> {
      sinon.spy(myFunction, 'logDonation');
      writeStub.resolves();
      docStub.body = undefined;
      await run();
      res.status.should.have.been.calledWith(400);
    });
  });
  // refactor to unit test new methods
  describe('functions/logDonation/writeDonation', async () => {
    let params;
    let fakeUser;
    let stubTime;
    beforeEach(() => {
      stubTime = firestore.Timestamp.now();
      params = {
        chargeId: 'fake-charge-id',
        firstName: 'fake-firstName',
        email: 'fake@email.biz',
        amount: 5,
        campaignID: 'fake-campaign',
        country: 'fake-country',
        referralSource: 'fake-referral',
        frequency: 'one-time',
        timestamp: stubTime,
        stripeEventId: 'fake-event',
        sourceDonor: 'fake-donor',
      };
      fakeUser = {
        uid: 'fake-donor',
        displayName: 'fake-firstName',
        email: 'fake@email.biz',
      };
      sandbox.stub(firestore.Timestamp, 'now').returns(stubTime);
      sandbox.stub(helpers, 'getDonorID').resolves('');
      sandbox.stub(auth, 'createUser').resolves(fakeUser);
      sandbox.stub(firestore.DocumentReference.prototype, 'set').resolves();
      sandbox.stub(firestore.DocumentReference.prototype, 'update').resolves();
      sandbox.stub(helpers, 'sendEmail');
      sandbox.stub(firestore.CollectionReference.prototype, 'add').resolves({
        id: 'fake-donation',
        update: () =>{return sinon.stub().resolves()},
      });
      sandbox.stub(helpers, 'getCostPerLearner').returns(0.25);
      sandbox.stub(assignLearners, 'assign').resolves();
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should call assign with the correct params', async () => {
      await myFunction.writeDonation(params);
      firestore.CollectionReference.prototype.add.should.have.been.calledWith(params)
    });
    it('should call add with the correct params', async () => {
      await myFunction.writeDonation(params);
      firestore.CollectionReference.prototype.add.should.have.been.calledWith({
        chargeId: params.chargeId,
        campaignID: params.campaignID,
        email: params.email,
        firstName: params.firstName,
        learnerCount: 0,
        referralSource: params.referralSource,
        sourceDonor: params.sourceDonor,
        amount: 5,
        stripeEventId: params.stripeEventId,
        costPerLearner: 0.25,
        frequency: params.frequency,
        countries: [],
        startDate: stubTime,
        country: params.country,
        timestamp: params.timestamp,
      });
    });
    it('should throw an error on a missing donor', async ()=> {
      params.email = 'MISSING';
      sandbox.spy(console, 'error');
      await myFunction.writeDonation(params);
      console.error.should.have.been.calledWith('No email was provided to identify or create a user!');
    });
    it('should use the default cpl on a missing costPerLearner', async () => {
      helpers.getCostPerLearner = sandbox.stub().resolves(undefined);
      sandbox.spy(myFunction, 'writeDonation');
      await myFunction.writeDonation(params);
      firestore.CollectionReference.prototype.add.should.have.been.calledWith({
        chargeId: params.chargeId,
        campaignID: params.campaignID,
        email: params.email,
        firstName: params.firstName,
        learnerCount: 0,
        referralSource: params.referralSource,
        sourceDonor: params.sourceDonor,
        amount: 5,
        stripeEventId: params.stripeEventId,
        costPerLearner: 1,
        frequency: params.frequency,
        countries: [],
        startDate: stubTime,
        country: params.country,
        timestamp: params.timestamp,
      })
    });
  });
});
