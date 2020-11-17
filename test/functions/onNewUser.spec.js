const test = require('firebase-functions-test')();
const sinon = require('sinon');
const functions = require('firebase-functions');
const admin = require('firebase-admin');

beforeEach(() => {});
afterEach(() => {});
describe('functions/onNewUser', async () => {
  const myFunction = require('../../functions/onNewUser');
  const firestore = admin.firestore.Firestore;
  let snap;
  let context;
  let updateMasterCountStub;
  let updateRegionsStub;
  let updateCampaignStub;
  let getStub;
  beforeEach(() => {});
  afterEach(() => {});
  it('should throw a missing argument error', async () => {});
  it('should return the new counts', async () => {});
  it('should not run', async () => {});
});
