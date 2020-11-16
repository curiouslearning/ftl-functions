const test = require('firebase-functions-test')();
const sinon = require('sinon');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const firestore = admin.firestore();
const helpers = require('../../functions/helpers/firebaseHelpers');
const { BatchManager } = require('../../functions/batchManager');
var sandbox = require('sinon').createSandbox();

describe('functions/forceRegionRecalculation', function () {
    const functionToTest = require('../../functions/forceRegionRecalculation');

    let updateMethod = sinon.stub();
    let collectionStub;
    let docStub;
    let snap;
    let res, req;

    beforeEach(function () {
        adminInitStub.restore();
        adminInitStub = sandbox.stub(admin, 'initializeApp');
        helpers.updateCountForRegion = sandbox.stub().returns(new Promise((res) => {return res(1);}))
        sandbox.stub(BatchManager.prototype, 'set');
        sandbox.stub(BatchManager.prototype, 'commit');
        sandbox.stub(admin.firestore(), 'batch').returns({set: sinon.stub(), commit: sinon.stub()});
        sinon.spy(console, 'error');
        sinon.spy(console, 'log');
        req = {};
        res = {
            status: sinon.stub().returns({end: sinon.stub()}),
        }

        docStub = {
            get: () => {return new Promise((res, rej) => {
                res({ data: () => {
                        return { countries: [{learnerCount: 1, country: 'fake-country', regions: 'fake-region'}]}}})
            })},
            update: updateMethod,
            doc: firestore.collection('user_pool').doc('fake-document-path')
        };

        snap = [
            {
                id: 'fake-id-1',
                data: () => {
                    return {
                        regions: [{region: 'fake-region-1', pin: {lat: 1, long: 1}, learnerCount: 1}],
                        country: 'fake-country-1',
                    }
                }
            },
            {
                id: 'fake-id-2',
                data: () => {
                    return {
                        regions: [{region: 'fake-region-2', pin: {lat: 2, long: 2}, learnerCount: 2}],
                        country: 'fake-country-2',
                    }
                }
            },
            {
                id: 'fake-id-3',
                data: () => {
                    return {
                        regions: [{region: 'fake-region-3', pin: {lat: 3, long: 3}, learnerCount: 3}],
                        country: 'fake-country-3',
                    }
                }
            }
        ];
    });

    const run = async (snap) => {
        const firestoreDoc = firestore.collection('user_pool').doc('fake-document-path');
        collectionStub = sinon.stub(admin.firestore(), 'collection');
        collectionStub.returns({doc: () => firestoreDoc, get: async () => {return new Promise((res) => {return res(snap);});} })

        await functionToTest.forceRegionRecalculation(req, res);
    }

    afterEach(() => {
        sandbox.restore();
        collectionStub.restore();
        console.error.restore();
        console.log.restore();
        adminInitStub.restore();
    })

    describe('forceRegionRecalculation', function () {
        it('should iterate over all regions and create a set of batches and commit them', async () => {

            await run(snap);
            BatchManager.prototype.set.should.have.been.calledWith(sinon.match.any, {
                regions: snap[0].data().regions ,
                country: snap[0].data().country,
                learnerCount: snap[0].data().regions[0].learnerCount
            }, {merge: true});
            //TODO assert the second/third calls to the "set" method
            BatchManager.prototype.commit.should.have.been.calledOnce;
            res.status.should.have.been.calledWith(200);
        });

        it('should throw an error when updating the count for the region', async () => {
            helpers.updateCountForRegion.throws('fake-error');

            await run(snap);

            BatchManager.prototype.set.should.not.have.been.called;
            BatchManager.prototype.commit.should.not.have.been.called;
            console.error.should.have.been.calledWith('Error when updating count for region: fake-region-1');
            res.status.should.have.been.calledWith(501);
        });

        it('should throw an error when updating the count for the region', async () => {
            helpers.updateCountForRegion.throws('fake-error');

            await run(snap);

            BatchManager.prototype.set.should.not.have.been.called;
            BatchManager.prototype.commit.should.not.have.been.called;
            console.error.should.have.been.calledWith('Error when updating count for region: fake-region-1');
            res.status.should.have.been.calledWith(501);
        });

        it('should throw an error when trying to commit the batch', async () => {
            BatchManager.prototype.commit.throws('fake-error');

            await run(snap);

            BatchManager.prototype.commit.should.have.been.calledOnce;
            console.error.should.have.been.calledWith('Error when trying to commit the batches: fake-error');
            res.status.should.have.been.calledWith(501);
        });
    })
})

