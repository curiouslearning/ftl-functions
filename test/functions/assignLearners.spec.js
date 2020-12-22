const sinon = require('sinon');
const admin = require('firebase-admin');
const sandbox = require('sinon').createSandbox();
const proxyquire = require('proxyquire');
const cloneDeep = require('lodash/cloneDeep');
const stubbedAdmin = cloneDeep(admin);
let stubTime;
let timeStub;

describe('functions/helpers/assignLearners', async () => {
  beforeEach(()=>{
    stubTime = admin.firestore.Timestamp.now();
    timeStub = sandbox.stub(stubbedAdmin.firestore.Timestamp, 'now').returns(stubTime);
  });

  afterEach(()=>{
    sandbox.restore();
    timeStub.restore();
  });

  const myFunction = proxyquire('../../functions/helpers/assignLearners', {
    'firebase-admin': stubbedAdmin
  });

  const helpers = require('../../functions/helpers/firebaseHelpers');
  const {BatchManager} = require('../../functions/batchManager');
  const firestore = stubbedAdmin.firestore.Firestore;

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
    let queryStub;

    beforeEach(() => {
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
      campaignRef = {
        empty: false,
        docs: [{
          id: 'fake-campaign',
          data: () => {
            return {
              costPerLearner: 1,
            };
          },
        }],
      };
      poolRef = {
        empty: false,
      };
      queryStub = sandbox.stub(firestore.Query.prototype, 'get')
      queryStub.onFirstCall().resolves(campaignRef);
      queryStub.onSecondCall().resolves(poolRef);
      donationStub = sandbox.stub(helpers, 'getDonation').resolves(donationRef);
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
      queryStub.onFirstCall().rejects('one of my promises failed');
      sandbox.spy(console, 'error');
      helpers.getDonation.returns(new Promise((res, rej) => rej('fake-error')));
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
    let donation;
    let snapshot;
    let learnerCount;
    let queueStub;
    let expected;
    let aggStub;
    beforeEach(() => {
      aggStub = sandbox.stub(myFunction, 'addLearnersToDonationSummary');

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
    });
  });

  describe('/addLearnersToDonationSummary', () => {
    let learners;
    let donation;
    let batch;
    let setStub;
    let expected;
    beforeEach(() => {
      learners = [
        {country: 'fake-country1', region: 'fake-c1-r1'},
        {country: 'fake-country1', region: 'fake-c1-r2'},
        {country: 'fake-country1', region: 'fake-c1-r3'},
        {country: 'fake-country2', region: 'fake-c2-r1'},
        {country: 'fake-country2', region: 'fake-c2-r2'},
        {country: 'fake-country2', region: 'fake-c2-r3'},
        {country: 'fake-country3', region: 'fake-c3-r1'},
        {country: 'fake-country3', region: 'fake-c3-r2'},
        {country: 'fake-country3', region: 'fake-c3-r3'},
      ];
      expected = {
        learnerCount: 9,
        countries: [
          {
            country: 'fake-country1',
            learnerCount: 3,
            regions: [
              {
                region: 'fake-c1-r1',
                learnerCount: 1,
              }, {
                region: 'fake-c1-r2',
                learnerCount: 1,
              }, {
                region: 'fake-c1-r3',
                learnerCount: 1,
              },
            ],
          }, {
            country: 'fake-country2',
            learnerCount: 3,
            regions: [
              {
                region: 'fake-c2-r1',
                learnerCount: 1,
              }, {
                region: 'fake-c2-r2',
                learnerCount: 1,
              }, {
                region: 'fake-c2-r3',
                learnerCount: 1,
              },
            ],
          }, {
            country: 'fake-country3',
            learnerCount: 3,
            regions: [
              {
                region: 'fake-c3-r1',
                learnerCount: 1,
              }, {
                region: 'fake-c3-r2',
                learnerCount: 1,
              }, {
                region: 'fake-c3-r3',
                learnerCount: 1,
              },
            ],
          },
        ],
      };
      donation = 'fake-donation';
      batch = new BatchManager();
      setStub = sandbox.stub(batch, 'set').resolves();
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should log and aggregate 9 new users', async () => {
      await myFunction.addLearnersToDonationSummary(learners, donation, batch);
      setStub.should.have.been.calledWith(donation, expected, true);
    });
    it('should log an error on missing input', async () => {
      sandbox.spy(console, 'error');
      learners = [];
      expected = 'no learners provided!';
      await myFunction.addLearnersToDonationSummary(learners, donation, batch);
      console.error.should.have.been.calledWith(expected);
    });
    it('should skip over learners that have no data', async () => {
      learners[3] = null;
      expected.learnerCount = 8;
      expected.countries[1].learnerCount = 2;
      expected.countries[1].regions = expected.countries[1].regions.slice(1, 3);
      await myFunction.addLearnersToDonationSummary(learners, donation, batch);
      setStub.should.have.been.calledWith(donation, expected, true);
    });
  });
});
