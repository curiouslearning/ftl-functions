const test = require('firebase-functions-test')();
const sinon = require('sinon');
const myFunction = require('../../functions/addCountryToSummary');
const functions = require('firebase-functions');
const admin = require('firebase-admin');


describe('functions/addCountryToSummary', function () {

    let updateMethod = sinon.stub();
    let collectionStub;
    let docStub;
    let snap;

    beforeEach(function () {
        sinon.spy(console, 'error');
        adminInitStub = sinon.stub(admin, 'initializeApp');

        docStub = {
            get: () => {return new Promise((res, rej) => {
                res({ data: () => {
                return { countries: [{learnerCount: 1, country: 'fake-country', regions: 'fake-region'}]}}})
            })},
            update: updateMethod
        };

        snap = {
            data: () => {
                return {
                    country: 'fake-country', regions: [{region: 'fake-region-1', learnerCount: 1}]
                }
            }
        };
    });

    const run = async (snap) => {
        collectionStub = sinon.stub(admin.firestore(), 'collection');
        collectionStub.returns({doc: () => docStub})

        const wrapped = test.wrap(myFunction.addCountryToSummary);
        await wrapped(snap);
    }

    afterEach(() => {
        collectionStub.restore();
        console.error.restore();
        adminInitStub.restore();
    })

    describe('addCountryToSummary', function () {
        it('should call to the aggregate_data collection to get a RegionSummary doc', async () => {
            const snap = {
                data: () => {
                    return {
                        country: 'fake-country', regions: [{region: 'fake-region-1', learnerCount: 1}]
                    }
                }
            };

            await run(snap);

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
        });

        it('should log an error if unable to update the collection', async () => {

            const error = new Error("collection-update-error");
            docStub.update = sinon.stub().throws(error);

            await run(snap);

            updateMethod.should.have.been.called;
            console.error.should.have.been.called;
        })
    })
})

