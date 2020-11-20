const test = require('firebase-functions-test')();
const sinon = require('sinon');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sandbox = require('sinon').createSandbox();

beforeEach(()=>{
  adminInitStub.restore();
  adminInitStub = sinon.stub(admin, 'initializeApp');
});
afterEach(() => {
  adminInitStub.restore();
  sinon.restore();
});
