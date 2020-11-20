const test = require('firebase-functions-test')();
const sinon = require('sinon');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const helpers = require('../../functions/helpers/firebaseHelpers');
const sandbox = require('sinon').createSandbox();

beforeEach(()=>{
  adminInitStub.restore();
  adminInitStub = sinon.stub(admin, 'initializeApp');
});

afterEach(()=>{
  adminInitStub.restore();
  sandbox.restore();
});

describe('functions/helpers/assignLearners', async () => {
  const myFunction = require('../../functions/helpers/assignLearners');
  describe('functions/helpers/assignLearners/assign', () => {
    beforeEach(() => {
      sandbox.stub(myFunction, 'assignInitialLearners');
      sandbox.stub(myFunction, 'assignAnyLearner');
      sandbox.stub(myFunction, 'assignLearnersByContinent');
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should call assignInitialLearners', async () => {
      helpers.getDonorID.resolves('fake-donor');
      // sandbox.stub(helpers, 'getDonorID').resolves('fake-uid');
      await myFunction.assign('fake-donor', 'fake-donation', 'fake-country');
      myFunction.assignInitialLearners.should.have.been.calledWith(
          'fake-donor',
          'fake-donation',
          'fake-country',
      );
    });
    it('should call assignAnyLearners', async () => {
      await myFunction.writeDonation('fake-donor', 'fake-donation', 'any');
      myFunction.assignAnyLearner.should.have.been.calledWith(
          'fake-donor',
          'fake-donation',
          'any'
      );
    });
    it('should call assignLearnersByContinent', async () => {
      await myFunction.writeDonation('fake-donor', 'fake-donation', 'Africa');
      myFunction.assignLearnersByContinent.should.have.been.calledWith(
          'fake-donor',
          'fake-donation',
          'Africa'
      );
    });
  });
});
