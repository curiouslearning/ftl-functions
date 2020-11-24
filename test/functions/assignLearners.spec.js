const test = require('firebase-functions-test')();
const sinon = require('sinon');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
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
  const helpers = require('../../functions/helpers/firebaseHelpers');
  const firestore = admin.firestore.Firestore;
  describe('/assign', () => {
    beforeEach(() => {
      sandbox.stub(myFunction, 'assignInitialLearners');
      sandbox.stub(myFunction, 'assignAnyLearner');
      sandbox.stub(myFunction, 'assignLearnersByContinent');
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should call assignInitialLearners', async () => {
      await myFunction.assign('fake-donor', 'fake-donation', 'fake-country');
      myFunction.assignInitialLearners.should.have.been.calledWith(
          'fake-donor',
          'fake-donation',
          'fake-country',
      );
    });
    it('should call assignAnyLearners', async () => {
      await myFunction.assign('fake-donor', 'fake-donation', 'any');
      myFunction.assignAnyLearner.should.have.been.calledWith(
          'fake-donor',
          'fake-donation',
          'any'
      );
    });
    it('should call assignLearnersByContinent', async () => {
      await myFunction.assign('fake-donor', 'fake-donation', 'Africa');
      myFunction.assignLearnersByContinent.should.have.been.calledWith(
          'fake-donor',
          'fake-donation',
          'Africa'
      );
    });
  });

  describe('/assignInitialLearners', async () => {
    let donor;
    let donation;
    let country;
    let donationStub;
    let donationRef;
    let poolRef;
    let campaignRef;
    let calcStub;
    let batchStub;
    let allStub;
    beforeEach(() => {
      sandbox.stub(firestore.Query.prototype, 'get').resolves();
      donor = 'fake-donor';
      donation = 'fake-donation';
      country = 'fake-country';
      donationRef = {
        empty: false,
        id: 'fake-donation',
        data: {
          id: 'fake-donation',
          amount: 5,
          sourceDonor: 'fake-donor',
        },
      };
      donationStub = sandbox.stub(helpers, 'getDonation').resolves();
      campaignRef = {
        empty: false,
        id: 'fake-campaign',
        data: () => {
          return {
            costPerLearner: 1,
          };
        },
      };
      poolRef = {
        empty: false,
      };
      allStub = sandbox.stub(Promise, 'all').resolves([
        donationRef,
        poolRef,
        campaignRef,
      ]);
      batchStub = sandbox.stub(myFunction, 'batchWriteLearners').resolves();
      calcStub = sandbox.stub(myFunction, 'calculateUserCount');
      calcStub.returns(20);
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should call to write batch with the correct params', async () => {
      await myFunction.assignInitialLearners(donor, donation, country);
      batchStub.should.have.been.calledWith(
          {
            empty: false,
          },
          {
            empty: false,
            id: 'fake-donation',
            data: {
              id: 'fake-donation',
              amount: 5,
              sourceDonor: 'fake-donor',
            },
          },
          20,
      );
    });
    it('should log an error to the console', async () => {
      allStub.rejects('one of my promises failed');
      sandbox.spy(console, 'error');
      await myFunction.assignInitialLearners(donor, donation, country);
      console.error.should.have.been.called;
    });
  });

  describe('/prioritizeLearnerQueue', async () => {
    let doc1;
    let doc2;
    let doc3;
    let queue;
    beforeEach(() => {
      doc1 = {
        data: () => {
          return {
            region: 'no-region',
          };
        },
      };
      doc2 = {
        data: () => {
          return {
            region: 'yes-region',
          };
        },
      };
      doc3 = {
        data: () => {
          return {
            region: 'yes-region',
          };
        },
      };
      queue = [doc1, doc2, doc3];
    });
    it('should sort the queue', async () => {
      const res = myFunction.prioritizeLearnerQueue(queue);
      console.log(res);
      res[0].data().region.should.equal('yes-region');
      res[1].data().region.should.equal('yes-region');
    });
  });

  describe('/calculateUserCount', async () => {
    let amount;
    let learnerCount;
    let cpl;
    beforeEach(() => {
      amount = 20;
      learnerCount = 0;
      cpl = 1;
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should return 3', async () => {
      const count = myFunction.calculateUserCount(amount, learnerCount, cpl);
      count.should.equal(3);
    });
    it('should return 8', async () => {
      learnerCount = 5;
      const count = myFunction.calculateUserCount(amount, learnerCount, cpl);
      count.should.equal(8);
    });
    it('should return 3', async () => {
      amount =5;
      cpl = 0.25;
      const count = myFunction.calculateUserCount(amount, learnerCount, cpl);
      count.should.equal(3);
    });
  });

  describe('/batchWriteLearners', async () => {
    const { BatchManager } = require('../../functions/batchManager');
    let donation;
    let snapshot;
    let learnerCount;
    let managerStub;
    let managerDoc;
    let stubTime;
    let timeStub;
    let queueStub;
    let expected;
    beforeEach(() => {
      stubTime = firestore.Timestamp.now();
      timeStub = sandbox.stub(firestore.Timestamp, 'now').returns(stubTime);
      learnerCount = 2;
      donation = {
        id: 'fake-donation',
        data: {
          sourceDonor: 'fake-donor',
        },
      };
      snapshot = {
        size: 3,
        docs: [
          {
            id: 'fake-learner1',
            data: () => {
              return {
                sourceDonor: 'unassigned',
                userStatus: 'unassigned',
              };
            },
          }, {
            id: 'fake-learner2',
            data: () => {
              return {
                sourceDonor: 'unassigned',
                userStatus: 'unassigned',
              };
            },
          }, {
            id: 'fake-learner3',
            data: ()=>{
              return {
                sourceDonor: 'unassigned',
                userStatus: 'unassigned',
              };
            },
          },
        ],
      };
      expected = {
        sourceDonor: 'fake-donor',
        sourceDonation: 'fake-donation',
        userStatus: 'assigned',
        assignedOn: stubTime,
      };
      sandbox.stub(BatchManager.prototype, 'commit').resolves();
      sandbox.stub(BatchManager.prototype, 'set').resolves();
      queueStub = sandbox.stub(myFunction, 'prioritizeLearnerQueue');
      queueStub.returns(snapshot.docs);
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('should call set twice with proper arguments', async () => {
      await myFunction.batchWriteLearners(snapshot, donation, learnerCount);
      BatchManager.prototype.set.should.have.been.calledTwice;
      BatchManager.prototype.set.should.always.have.been.calledWith(sinon.match.any, expected, true);
    });
    it('should call set three times with proper args', async () => {
      learnerCount = 4;
      await myFunction.batchWriteLearners(snapshot, donation, learnerCount);
      BatchManager.prototype.set.should.have.been.calledThrice;
      BatchManager.prototype.set.should.always.have.been.calledWith(sinon.match.any, expected, true);
    })
  });
});
