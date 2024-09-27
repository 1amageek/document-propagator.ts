import * as admin from "firebase-admin";
import firebaseFunctionsTest from 'firebase-functions-test';

// エミュレータの設定
const projectId = 'your-project-id';
const testEnv = firebaseFunctionsTest({ projectId }, '../firestore.rules');
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

// テスト用のoptions（モックの認証情報）を直接定義
const options = {
  type: "service_account",
  project_id: projectId,
  private_key_id: "mock-key-id-1234567890abcdef",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC9HOkNeqc3Zx/8\nU8YtxlNfhBdJqYOlvYw9SyMNqGHk4aogWdYw5TGDTcJIIXc4uZCL2xUIxni7TjQP\nkdNylHWd0jhUJJJIxHgp8fVrnyL3hrYL6gliPAqSNRwWaWdnW8tPqbCRLLf2AZq1\nCr3UIEenD7bfh8ZGwplBEYtCVZJDIZjLaMFb3kuMDzRa8tE+ErZLie2DZ72xO0Uo\nzWGtBgGUKp9+bHK0WgQ6xk5n8R9prOvHFpX9tP7b8oFdAFXlYwgul/giQ7TXULKm\nD2EF5eHIxru9XlTWP/l6g0RcI7InRYjKUVb9fBUz5LvpC3SBZeq3QzRW8lRtZh2y\nOSyGP5R3AgMBAAECggEABJ1AsLjFQTt4QFLF75dqA6QzbGWWGp8ZCXInUomcnSCt\nUZT9YN3fUurP8OOuxWKyGiPMHXkUWHdEjVcO9VVUBPAhBhPvnqxOdOkY7OlwgbVE\nCErnvF4aKOQyU86PZYlIqZx03eLxhmK0OOc/vz5N1QEPK9By2QSsRXi+ZHmHnR+U\naNgYRLrDJDy/bNfWVKp03E/vq0G7W3TcaIzvUeY3Z1XD97gkiA1M4bJDDKNWCgF+\n0+7pu5kSY+HXwzvqX51YGEzR69MV5YUVzEXcE7p2V2DjDpWBKG59JlhXzGnYtLjM\nppBz7NiS/AjQ6UcD1weCg9/HbZMqKjIXdTQg+RhIgQKBgQD32C+TLgF3kPFQtX5x\nGURcaNxbEVNaBoOpzC57WTI6xBBsRTEgtRu3PheJVyYbxDqr0YLi3B/kOgkOBQtj\nRxRwzc+4HgZRfOqpBtOiQ5y37NkB8pzqcvHFO9T8lmYwNeOBaKIuP1qJdaRUfOp8\n9gFxLuyF5p4bSzkFvjNTu3v+gQKBgQDDPIe2h9I0UHQIdPW774E8B8kFhtB8DFHg\n0/C4YgYqeK50uPTd7NOL8vG1Cmz0OBOO+YKT69qxq8HkRUKzsuE6hELVnUdCqfes\n5XkuUIGwKjGZBFH6pGZnXhdgfuKDDwmg2j1zKeU9YnF6RQzzNw2N+4vnLqSC0cTK\nDVtgp1n7dwKBgEokEtsLCu2V9lZmPh+VFmZKJgoVQYlA5SqJTqFzkYixFMO+Uk8h\nJDlBXgWtJLJtcSdOKDBYgYw22WZMBdlzyRWZ1mQ04sG1E4L0yy6hlGG2JXOqPwIP\nPJndRIvbHwXGm+Js35p0IhAF7Zn05iizVMOEEHjK4ZQaMMBxePc0sR4BAoGANwYn\niU/3s2GKNJdnOa3UFB4lzkqOUWgKoGE6IQwbWj0UaZO7oO/GXlFp5ecwRYJfqnp7\n8wCEKVmW6KALbJ9uDHk1t3pXVS9aBX48LWmTQ2oK2gxP7A/W+xLrXuwZcLzSwb59\nFweDLnXMDGbWRjFDzl5pmSnWK7jMtNLhLLXrCH0CgYBqUscnmcyyxHMwV0A4D47k\nYK5FFIxfI+MHhgDM0E1h/UYjXKh0BDwpMXqx/fRcF5cNXdZIezbr59/yLUVZPGCi\nzrZKP3VsmLpiBSvxYnl3CrKn4BCZZzAUUNTKn9WdgTdyLkH7n9cTbcUvYofsPl9g\nfBfKRWGgr7KxEsAPCCkFcA==\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-abcde@your-project-id.iam.gserviceaccount.com",
  client_id: "123456789012345678901",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-abcde%40your-project-id.iam.gserviceaccount.com"
};

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

describe('Document Propagator Tests', () => {
  beforeAll(async () => {
    // テストデータのセットアップ
    const companyRef = firestore.doc('companies/company1');
    const placeRef = firestore.doc('places/place1');
    const employee1Ref = firestore.doc('employees/employee1');
    const employee2Ref = firestore.doc('employees/employee2');

    await companyRef.set({
      name: 'Test Company',
      placeID: 'place1',
      employeeIDs: ['employee1', 'employee2']
    });

    await placeRef.set({
      name: 'Test Place',
      address: '123 Test St'
    });

    await employee1Ref.set({
      name: 'John Doe',
      position: 'Manager'
    });

    await employee2Ref.set({
      name: 'Jane Smith',
      position: 'Developer'
    });
  });

  afterAll(async () => {
    await Promise.all([
      firestore.doc('companies/company1').delete(),
      firestore.doc('places/place1').delete(),
      firestore.doc('employees/employee1').delete(),
      firestore.doc('employees/employee2').delete(),
      firestore.doc('lang/ja/companies/company1').delete(),
      firestore.doc('lang/en/companies/company1').delete(),
      firestore.doc('lang/ja/places/place1').delete(),
      firestore.doc('lang/en/places/place1').delete(),
      firestore.doc('lang/ja/employees/employee1').delete(),
      firestore.doc('lang/en/employees/employee1').delete(),
      firestore.doc('lang/ja/employees/employee2').delete(),
      firestore.doc('lang/en/employees/employee2').delete(),
    ]);
    testEnv.cleanup();
  });

});