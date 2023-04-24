import * as admin from "firebase-admin";
import firebaseFunctionsTest from 'firebase-functions-test';

// エミュレータの設定
const projectId = 'your-project-id';
const testEnv = firebaseFunctionsTest({ projectId }, '../firestore.rules');
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
// process.env.GCLOUD_PROJECT = 'your-project-id';

import options from "../../admin.json"
const appOptions = {
  projectId: projectId,
  credential: admin.credential.cert(options as any),
};

// Firestoreインスタンスを作成します。
const app = admin.initializeApp(appOptions);
const firestore = app.firestore();
firestore.settings({
  host: 'localhost:8080',
  ssl: false,
});


describe('Cloud Functions', () => {

  beforeAll(() => {

  });

  // afterEach(async () => {
  //   await firebase.firestore.clearFirestoreData({ projectId });
  // });

  afterAll(() => {
    testEnv.cleanup();
  });

  test('Sample test: Add data to Firestore', async () => {
    const testData = {
      message: 'Hello, world!',
    };

    // Add data to Firestore using the admin app
    const docRef = firestore.collection('firstDrafts').doc('testDoc');
    await docRef.set(testData);

    // Read data using the regular Firestore instance
    const snapshot = await firestore.collection('firsts').doc('testDoc').get();
    const data = snapshot.data();

    console.log(data)

    expect(data).toEqual(testData);
  });
});
