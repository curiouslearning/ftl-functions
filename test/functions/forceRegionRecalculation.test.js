const test = require('firebase-functions-test')();
const sinon = require('sinon');
const functionToTest = require('../../functions/forceRegionRecalculation');
const functions = require('firebase-functions');
const admin = require('firebase-admin');


describe('functions/forceRegionRecalculation', function () {

    let updateMethod = sinon.stub();
    let collectionStub;
    let docStub;
    let snap;

    beforeEach(function () {
        sinon.spy(console, 'error');
        sinon.spy(console, 'log');
        adminInitStub = sinon.stub(admin, 'initializeApp');

        docStub = {
            get: () => {return new Promise((res, rej) => {
                res({ data: () => {
                        return { countries: [{learnerCount: 1, country: 'fake-country', regions: 'fake-region'}]}}})
            })},
            update: updateMethod
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
        collectionStub = sinon.stub(admin.firestore(), 'collection');
        collectionStub.returns({doc: () => docStub})

        const wrapped = test.wrap(functionToTest.forceRegionRecalculation);
        await wrapped(snap);
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

