const test = require('firebase-functions-test')();
const sinon = require('sinon');
const myFunction = require('../../functions/addCountryToSummary');
const functions = require('firebase-functions');
const admin = require('firebase-admin');

adminInitStub = sinon.stub(admin, 'initializeApp');

describe('functions/addCountryToSummary', function () {

    let updateMethod = sinon.stub();
    beforeEach(function () {

        docStub = {
            get: () => {return new Promise((res, rej) => {
                res({ data: () => {
                return { countries: [{learnerCount: 1, country: 'fake-country', regions: 'fake-region'}]}}})
            })},
            update: updateMethod
        };

        collectionStub = sinon.stub(admin.firestore(), 'collection');
        collectionStub.returns({doc: () => docStub})
    });

    afterEach(function () {
    });

    describe('addCountryToSummary', function () {
        it('should call to the aggregate_data collection to get a RegionSummary doc', async () => {
            const snap = {
                data: () => {
                    return {
                        country: 'fake-country', regions: [{region: 'fake-region-1', learnerCount: 1}]
                    }
                }
            };

            const wrapped = test.wrap(myFunction.addCountryToSummary);
            await wrapped(snap);

            updateMethod.should.have.been.calledWith({
                countries: [
                    {
                        learnerCount: 1,
                        country: 'fake-country',
                        regions: 'fake-region'
                    },
                    {
                        country: 'fake-country',
                        learnerCount: 1,
                        regions: [
                            {
                                region: 'fake-region-1',
                                learnerCount: 1
                            }
                        ]
                    }
                ]
            })
        })
    })
})

