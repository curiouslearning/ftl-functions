const http = require('http');
const admin = require('firebase-admin');
const sinon = require('sinon');
const PassThrough = require('stream').PassThrough;
const proxyquire = require('proxyquire');
const set = require('lodash/set');
let sandbox;

describe('/functions/logStripeEvent', () => {
    let assignInitialLearnersStub;
    let assignLearners = require('../../functions/helpers/assignLearners');
    let emailHelperStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        assignInitialLearnersStub = sandbox.stub(assignLearners, 'assignInitialLearners').resolves();
        emailHelperStub = sandbox.stub(helpers, 'sendEmail').resolves();
    });

    afterEach(() => {
        sandbox.restore();
    });

  const myFunction = proxyquire('../../functions/logStripeEvent', {'firebase-admin': admin, 'assignLearners': assignLearners});
  const logDonation = require('../../functions/logDonation');
  const helpers = require('../../functions/helpers/firebaseHelpers');


  describe('/logPaymentIntent', () => {
    let res;
    let _event;
    let handleStub;
    let run;
    let status;
    let send;

    beforeEach(() => {
      status = sandbox.stub();
      send = sandbox.spy();
      res = {send, status};
      status.returns(res);
      this.request = sandbox.stub(http, 'request');
      handleStub = sandbox.stub(myFunction, 'handlePaymentIntentSucceeded');
      handleStub.resolves({msg: 'success', data: {}});

      let collectionStub = sandbox.stub(admin.firestore(), 'collectionGroup');
      collectionStub.returns({where: () => {return {get: async () => {return new Promise((res) => {return res({empty: true});});} }}});

      _event = {
        id: 'fake-event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            amount: 2076,
            description: 'Give Lively / Smart Donations',
            metadata: {},
          },
        },
      };
      run = async () => {
        const request = new PassThrough();
        sandbox.stub(request, 'write');
        this.request.returns(request);
        return await myFunction.logPaymentIntent({body: _event}, res);
      };
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should return 200', async () => {
      await run();
      status.should.have.been.calledWith(200);
    });

    it('should not log donations that are not from GiveLively', async () => {
      _event.data.object.description= 'donation from fake-donor';
      await run();
      handleStub.should.not.have.been.called;
    });

    it('should return 400', async () => {
      _event = null;
      await run();
      status.should.have.been.calledWith(400);
    });

    it('should send the data object to the handler', async () => {
      await run();
      handleStub.should.have.been.calledWith(_event.data.object, _event.id);
    });
  });

  describe('/handlePaymentIntentSucceeded', () => {
    let intent;
    let id;
    let writeStub;
    let expected;
    let getOrCreateStub;
    beforeEach(() => {
      getOrCreateStub = sandbox.stub(helpers, 'getOrCreateDonor');
      getOrCreateStub.resolves('fake-donor');
      intent = {
        amount: 2076,
        description: 'Give Lively / Smart Donations',
        metadata: {
          utm_source: 'fake-campaign|fake-country|fake-referral',
          user_email: 'fake@email.biz',
          user_first_name: 'fakeName',
          transaction_fee_covered_by_donor: '$0.76',
        },
      };
      id = 'fake-event';
      expected = {
        stripeEventId: id,
        firstName: intent.metadata.user_first_name,
        email: intent.metadata.user_email,
        amount: 20,
        chargeId: 'fake-charge-id',
        coveredByDonor: 0.76,
        campaignID: 'fake-campaign',
        country: 'fake-country',
        referralSource: 'fake-referral',
        frequency: 'one-time',
        sourceDonor: 'fake-donor',
        donationSource: 'Stripe',
        isStripePayment: true
      };
      writeStub = sandbox.stub(logDonation, 'writeDonation').resolves(
          {sourceDonor: 'fake-source-donor', donationID: 'fake-donation-ID', country: 'fake-country'});
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('should parse the event object and pass it on', async () => {
      await myFunction.handlePaymentIntentSucceeded(intent, id, 'fake-charge-id');
      writeStub.should.have.been.calledWith(expected);
    });

    it('should save a third party donation source', async () => {
      set(intent, 'donationSource', 'fake-donation-source');
      set(expected, 'isStripePayment', false);
      set(expected, 'donationSource', 'fake-donation-source');
      await myFunction.handlePaymentIntentSucceeded(intent, id, 'fake-charge-id');
      writeStub.should.have.been.calledWith(expected);
    });

    it('should handle missing metadata with a warning', async () => {
      sandbox.spy(console, 'warn');
      intent.metadata = {};
      await myFunction.handlePaymentIntentSucceeded(intent, id);
      console.warn.should.have.been.called;
    });

    it('should replace missing data with placeholder values', async () => {
      intent.metadata = {};
      expected.firstName = 'MISSING';
      expected.email = 'MISSING';
      expected.coveredByDonor= 'MISSING';
      expected.campaignID = 'MISSING';
      expected.referralSource= 'MISSING';
      expected.country = 'MISSING';
      expected.amount = 20.76;
      expected['needsAttention'] = true;
      await myFunction.handlePaymentIntentSucceeded(intent, id, 'fake-charge-id');
      writeStub.should.have.been.calledWith(expected);
    });

    it('should only update an existing payment and not assign learners or send an email', async () => {
        const assignLearnersStub = sandbox.stub(assignLearners, 'assign').resolves();

        await myFunction.handlePaymentIntentSucceeded(intent, id, 'fake-charge-id', {sourceDonor: 'fake-donor'});
        assignLearnersStub.should.not.have.been.called;
        emailHelperStub.should.not.have.been.called;
        writeStub.should.have.been.calledWith(expected);
      });

  });
});
