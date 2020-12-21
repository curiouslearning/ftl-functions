const test = require('firebase-functions-test')();
const sinon = require('sinon');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const PassThrough = require('stream').PassThrough;
const http = require('http');
const nodemailer = require('nodemailer');
const Mailer = require('nodemailer/lib/Mailer');
const sandbox = require('sinon').createSandbox();

beforeEach(()=>{
  adminInitStub.restore();
  adminInitStub = sinon.stub(admin, 'initializeApp');
});

afterEach(()=>{
  adminInitStub.restore();
  sandbox.restore();
});
describe('functions/logDonation', async () => {
  const helpers = require('../../functions/helpers/firebaseHelpers');
  const assignLearners = require('../../functions/helpers/assignLearners');
  const myFunction= require('../../functions/logDonation');
  const auth = admin.auth();
  const firestore = admin.firestore.Firestore;
  describe('functions/logDonation/logDonation', ()=>{
    const firestore = admin.firestore.Firestore;
    let docStub;
    let writeStub;
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
      run = async () =>{
        const request = new PassThrough();
        const write = sandbox.stub(request, 'write');
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
      const timeStub = sandbox.stub(firestore.Timestamp, 'now').returns(stubTime);
      await run();
      writeStub.should.have.been.calledWith({
        firstName: 'fake-firstName',
        email: 'fake@email.biz',
        amount: 5,
        frequency: 'one-time',
        campaignID: 'fake-campaign',
        country: 'fake-country',
        referralSource: 'fake-referral',
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
      const timeStub = sandbox.stub(firestore.Timestamp, 'now').returns(stubTime);
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
      }));
    });
    it('should throw an error', async ()=> {
      sinon.spy(myFunction, 'logDonation');
      writeStub.resolves();
      docStub.body = undefined;
      await run();
      res.status.should.have.been.calledWith(501);
    });
  });
  // refactor to unit test new methods
  describe('functions/logDonation/writeDonation', async () => {
    let params;
    let fakeUser;
    let docRefObject;
    let stubTime;
    beforeEach(() => {
      stubTime = firestore.Timestamp.now();
      params = {
        firstName: 'fake-firstName',
        email: 'fake@email.biz',
        amount: 5,
        campaignID: 'fake-campaign',
        country: 'fake-country',
        referralSource: 'fake-referral',
        frequency: 'one-time',
        timestamp: stubTime,
        stripeEventId: 'fake-event',
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
      sandbox.stub(firestore.CollectionReference.prototype, 'add').resolves({
        id: 'fake-donation',
        update: () =>{return sinon.stub().resolves()},
      });
      sandbox.stub(helpers, 'getCostPerLearner').returns(0.25);
      sandbox.stub(assignLearners, 'assign').resolves();
      sandbox.stub(auth, 'generateSignInWithEmailLink').resolves('fake-url');
      sandbox.stub(myFunction, 'generateNewLearnersEmail').resolves();
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should call assign with the correct params', async () => {
      await myFunction.writeDonation(params);
      assignLearners.assign.should.have.been.calledWith(
          fakeUser.uid,
          'fake-donation',
          params.country,
      );
    });
    it('should call createUser with the correct params', async () => {
      await myFunction.writeDonation(params);
      auth.createUser.should.have.been.calledWith({
        displayName: 'fake-firstName',
        email: 'fake@email.biz',
      });
    });
    it('should call set with the correct params', async () => {
      await myFunction.writeDonation(params);
      firestore.DocumentReference.prototype.set.should.have.been.calledWith({
        firstName: 'fake-firstName',
        email: 'fake@email.biz',
        dateCreated: stubTime,
        donorID: 'fake-donor',
      });
    });
    it('should call add with the correct params', async () => {
      await myFunction.writeDonation(params);
      firestore.CollectionReference.prototype.add.should.have.been.calledWith({
        campaignID: 'fake-campaign',
        learnerCount: 0,
        sourceDonor: 'fake-donor',
        amount: 5,
        stripeEventId: 'fake-event',
        costPerLearner: 0.25,
        frequency: 'one-time',
        countries: [],
        startDate: stubTime,
        country: 'fake-country',
      });
    });
    it('should throw an error on a missing donor', async ()=> {
      params.email = 'MISSING';
      sandbox.spy(console, 'error');
      await myFunction.writeDonation(params);
      console.error.should.have.been.calledWith('No email was provided to identify or create a user!');
    });
    it('should throw an error on a missing costPerLearner', async () => {
      helpers.costPerLearner = sandbox.stub().resolves(undefined);
      sandbox.spy(myFunction, 'writeDonation');
      try {
        await myFunction.writeDonation(params);
      } catch (e) {
        e.message.should.equal('received undefined cost per learner');
      }
      myFunction.writeDonation.should.have.thrown;
    });
    it('should call sendNewLearnersEmail with the correct params', async () => {
      await myFunction.writeDonation(params);
      myFunction.generateNewLearnersEmail.should.have.been.calledWith(
          'fake-firstName',
          'fake@email.biz',
          'fake-url',
      );
    });
  });
  
  describe('function/logDonation/createDonor', async () => {
    let params;
    let stubTime;
    let fakeUser;
    beforeEach(() => {
      stubTime = firestore.Timestamp.now();
      params = {
        firstName: 'fake-firstName',
        email: 'fake@email.biz',
        amount: 5,
        campaignID: 'fake-campaign',
        country: 'fake-country',
        referralSource: 'fake-referral',
        frequency: 'one-time',
        timestamp: stubTime,
      };
      fakeUser = {
        uid: 'fake-donor',
        displayName: 'fake-firstName',
        email: 'fake@email.biz',
      };
      sandbox.stub(firestore.Timestamp, 'now').returns(stubTime);
      sandbox.stub(auth, 'createUser').resolves(fakeUser);
      sandbox.stub(firestore.DocumentReference.prototype, 'set').resolves();
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('should add a needs attention flag with missing data', async () => {
      params.referralSource = 'MISSING';
      params['needsAttention'] = true;
      await myFunction.createDonor(params);
      firestore.DocumentReference.prototype.set.should.have.been.calledWith({
        firstName: 'fake-firstName',
        email: 'fake@email.biz',
        dateCreated: stubTime,
        donorID: 'fake-donor',
        needsAttention: true,
      });
    });
    it('should log an error if it cannot create a user', async () => {
      auth.createUser.rejects('failure');
      sandbox.spy(console, 'error');
      await myFunction.createDonor(params);
      console.error.should.have.been.called;
    });
  });
  describe('functions/logDonation/generateNewLearnersEmail', async () => {
    let name;
    let email;
    let url;
    let sendMail;
    let transport;
    let mailer;
    beforeEach(() => {
      name = 'fake-firstName';
      email = 'fake@email.biz';
      url = 'fake-url';
      transport = {
        sendMail: (data, callback) => {
          callback(null, {response: 'okay'});
        },
      };
      sendMail = sandbox.stub(nodemailer, 'createTransport');
      sendMail.returns(transport);
      mailer = sandbox.stub(Mailer.prototype, 'sendMail');
      mailer.callsArgWith(1, null, 'success');
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('should call the callback', async () => {
      sandbox.spy(console, 'log');
      await myFunction.generateNewLearnersEmail(name, email, url);
      console.log.should.have.been.called;
    });
    it('should log an error', async () => {
      sandbox.spy(console, 'error');
      transport = {
        sendMail: (data, callback) => {
          const err = new Error('you failed');
          callback(err, null);
        },
      };
      sendMail.returns(transport);
      // mailer.callsArgWith(1, new Error(), null);
      await myFunction.generateNewLearnersEmail(name, email, url);
      console.error.should.have.been.called;
    });
  });
});
