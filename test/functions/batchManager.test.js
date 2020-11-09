const test = require('firebase-functions-test')();
const sinon = require('sinon');
const myFunction = require('../../functions/BatchManager');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const firestore = admin.firestore();

// adminInitStub = sinon.stub(admin, 'initializeApp');

describe('functions/BatchManager', function() {
  const date = new Date(Date.now());
  const getFakeUser = (i)=>{
    const id = 'fake-user;' + i;
    return {id: id, data: {
      userID: id,
      country: 'fake-country',
      region: 'fake-region',
      sourceDonor: 'fake-donor',
      sourceCampaign: 'fake-campaign',
      dateCreated: admin.firestore.Firestore.Timestamp.fromDate(date),
      learnerLevel: 'first-open',
      sourceDonation: 'fake-donation',
      userStatus: 'assigned',
      assignedOn: admin.firestore.Firestore.Timestamp.fromDate(date),
    }};
  };
  beforeEach(function() {
    batchStub = sinon.stub(firestore, 'batch');
    batchStub.returns({
      set: ()=>sinon.fake(),
      update: ()=>sinon.fake(),
      delete: ()=>sinon.fake(),
      commit: ()=>sinon.fake(()=>{
        return new Promise((res, rej)=>{
          resolve('Success!');
        });
      }),
    });
    collectionStub = sinon.stub(firestore, 'collection');
    collectionStub.returns({
      collection: 'user_pool',
      doc: (doc)=> sinon.fake((doc)=>{
        return '/user_pool/'+doc;
      }),
    });
    manager = new myFunction.BatchManager();
    docList = [];
    for (let i=0; i < 1000; i++) {
      docList.push(getFakeUser(i));
    }
  });

  afterEach(function() {
    batchStub.restore();
    collectionStub.restore();
    manager = null;
  });

  describe('BatchManager', function() {
    it('should create an arry of batch objects with one element', async ()=>{
      batchStub.restore();
      manager = new myFunction.BatchManager();
      manager.batches.length.should.equal(1);
      manager.batches[0].should.be.an.instanceOf(admin.firestore.WriteBatch);
    });
  });

  describe('updateBatch', function() {
    it('should increment the batch size by 1 when called', async ()=>{
      manager.updateBatch();
      manager.batchSize.should.equal(1);
    });
    it('should add a new batch element if the batch size > 495', async ()=>{
      manager.batchSize = 495;
      manager.updateBatch();
      manager.batches.length.should.equal(2);
    });
    it('should reset the batch size to 0 when adding a new batch', async ()=>{
      manager.batchSize = 495;
      manager.updateBatch();
      manager.batchSize.should.equal(0);
    });
    it('should increment the batch count by 1 when adding a new batch', async ()=>{
      manager.batchSize = 495;
      manager.updateBatch();
      manager.batchCount.should.equal(1);
    });
    it('should throw an error if the batch could not be updated', async ()=>{

    });
  });

  describe('set', function() {
    it('should call updateBatch', async ()=>{
      const spy = sinon.spy(manager, 'updateBatch');
      let docRef = firestore.collection('user_pool').doc(docList[0].id);
      manager.set(docRef, docList[0].data, true);
      spy.should.have.been.calledOnce;
    });
    it('should add an operation to the most recent batch', async ()=>{
      let docRef = firestore.collection('user_pool').doc(docList[0].id);
      manager.set(docRef, docList[0].data, true);
      const length = manager.batches.length;
      manager.batches[0].set().should.have.been.calledOnce;
    });
    it('should throw an error if the batch could not be updated', async ()=>{

    });
  });

  describe('update', function() {
    it('should call updateBatch', async ()=>{
      const spy = sinon.spy(manager, 'updateBatch');
      let docRef = firestore.collection('user_pool').doc(docList[0].id);
      manager.update(docRef, docList[0].data);
      spy.should.have.been.calledOnce;
    });
    it('should add an operation to the most recent batch', async ()=>{
      let docRef = firestore.collection('user_pool').doc(docList[0].id);
      manager.update(docRef, docList[0].data);
      manager.batches[0].update().should.have.been.calledOnce;
    });
    it('should throw an error if the batch could not be updated', async ()=>{
    });
  });

  describe('delete', function() {
    it('should call updateBatch', async ()=>{
      const spy = sinon.spy(manager, 'updateBatch');
      let docRef = firestore.collection('user_pool').doc('fake-user');
      manager.delete(docRef);
      spy.should.have.been.calledOnce;
    });
    it('should add an operation to the most recent batch', async ()=>{
      let docRef = firestore.collection('user_pool').doc(docList[0].id);
      manager.delete(docRef);
      const length = manager.batches.length;
      manager.batches[0].delete().should.have.been.calledOnce;
    });
    it('should throw an error if the batch could not be updated', async ()=>{

    });
  });

  describe('commit', function() {
    it('should call commit on each batch in the array', async ()=>{
      let docRef = firestore.collection('user_pool').doc('fake-user');
      manager.set(docRef, docStub, false);
      const res = manager.commit();
      manager.batches[0].commit().should.have.been.calledOnce
    });
    it('should wait 1050ms between actions', async ()=>{

    });
    it('should return true on successful commit', async ()=>{
      let manager = new myFunction.BatchManager();
      const spy = sinon.spy(manager, 'commit');
      const res = manager.commit();
      spy.should.have.returned(true);
    });
    it('should throw an error on unsuccessful commit', async ()=>{

    });
  });
});
