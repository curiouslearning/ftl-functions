const test = require('firebase-functions-test')();
const sinon = require('sinon');
const admin = require('firebase-admin');
const proxyquire = require('proxyquire');

describe.only('functions/addCountryToSummary', function () {
    const sandbox = require('sinon').createSandbox();
    let updateStub = sinon.stub();

    const myFunction = proxyquire('../../functions/addCountryToSummary', {
        'firebase-admin': admin
    });

    let snap;

    beforeEach(function () {
        sinon.spy(console, 'error');

        snap = {
            data: () => {
                return {
                    country: 'fake-country', regions: [{region: 'fake-region-1', learnerCount: 1}]
                }
            }
        };

        sandbox.stub(admin, 'firestore')
            .get(() => () => {
                return {
                    collection: () => {
                        return { doc: () => {
                            return {
                                get: () => new Promise(res => res({ data: () => {
                                    return { countries: [
                                        {
                                            learnerCount: 1,
                                            country: 'fake-country-existing',
                                            regions: 'fake-region-existing'
                                        }]}}})),
                                update: updateStub
                            }
                        }}
                    }
                }
            });
    });

    afterEach(() => {
        console.error.restore();
        sandbox.restore();
    })

    const run = async (snap) => {
        const wrapped = test.wrap(myFunction.addCountryToSummary);
        await wrapped(snap);
    }

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

            updateStub.should.have.been.calledWith({
                countries: [
                    {
                        learnerCount: 1,
                        country: 'fake-country-existing',
                        regions: 'fake-region-existing'
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
            updateStub = sinon.stub().throws(error);

            await run(snap);

            updateStub.should.have.been.called;
            console.error.should.have.been.called;
        })
    })
})

