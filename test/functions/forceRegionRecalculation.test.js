const test = require('firebase-functions-test')();
const sinon = require('sinon');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const firestore = admin.firestore();
const helpers = require('../../functions/helpers/firebaseHelpers');

beforeEach(() => {
    adminInitStub.restore();
    adminInitStub = sinon.stub(admin, 'initializeApp');
    helpers.updateCountForRegion = sinon.stub().returns(new Promise((res) => {return res(1);}))
})

afterEach(() => {
    adminInitStub.restore();
})
describe('functions/forceRegionRecalculation', function () {
    const functionToTest = require('../../functions/forceRegionRecalculation');

    let updateMethod = sinon.stub();
    let collectionStub;
    let docStub;
    let snap;

    beforeEach(function () {
        sinon.spy(console, 'error');
        sinon.spy(console, 'log');

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
                        regions: [{region: 'fake-region-1', pin: {lat: 1, long: 1}, learnerCount: 1}],
                        country: 'fake-country-1',
                    }
                }
            },
            {
                id: 'fake-id-3',
                data: () => {
                    return {
                        regions: [{region: 'fake-region-1', pin: {lat: 1, long: 1}, learnerCount: 1}],
                        country: 'fake-country-1',
                    }
                }
            }
        ];
    });

    const run = async (snap) => {
        const firestoreDoc = firestore.collection('user_pool').doc('fake-document-path');
        collectionStub = sinon.stub(admin.firestore(), 'collection');
        collectionStub.returns({doc: () => firestoreDoc, get: async () => {return new Promise((res) => {return res(snap);});} })

        const req = {};
        const res = {
            status: sinon.stub(),
            end: sinon.stub()
        }
        await functionToTest.forceRegionRecalculation(req, res);
    }

    afterEach(() => {
        collectionStub.restore();
        console.error.restore();
        console.log.restore();
        adminInitStub.restore();
    })

    describe('forceRegionRecalculation', function () {
        it.only('should iterate over all regions and create a set of batches and commit them', async () => {

            //TODO stub the batch

            await run(snap);

        });


    })
})

