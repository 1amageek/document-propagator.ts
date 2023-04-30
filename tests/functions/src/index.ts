import { initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import * as propagator from "@1amageek/document-propagator"
import { depedencyResource } from "@1amageek/document-propagator"

const app = initializeApp()
const firestore = getFirestore(app)
if (process.env.FUNCTIONS_EMULATOR) {
  firestore.settings({
    host: "localhost:8080",
    ssl: false,
  })
}

export const r = propagator.resolve(firestore,
  { regions: ["asia-northeast1"] },
  [
    {
      from: "/companies/{companyID}",
      to: "lang/{lang}/companies/{companyID}",
      resources: [
        depedencyResource("placeID", "place", "/lang/{lang}/places"),
        { documentID: "employeeIDs", field: "employees", resource: "/lang/{lang}/employees" }
      ],
      group: {
        documentID: "lang",
        values: ["ja", "en"]
      }
    },
    {
      from: "/places/{placeID}",
      to: "lang/{lang}/places/{placeID}",
      resources: [],
      group: {
        documentID: "lang",
        values: ["ja", "en"]
      }
    },
    {
      from: "/employees/{employeeID}",
      to: "lang/{lang}/employees/{employeeID}",
      resources: [],
      group: {
        documentID: "lang",
        values: ["ja", "en"]
      }
    }
  ], () => {
    return true
  }, 
  async (context, change) => {
    return change.after.data()!
  },
   null, (before, after) => {
    return true
  }, null)
