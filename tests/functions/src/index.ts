import { initializeApp } from "firebase-admin/app"
import { getFirestore, DocumentReference } from "firebase-admin/firestore"
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
  }, null, (before, after) => {
    const beforeData = clean(before.data())
    const afterData = clean(after.data())
    return !(JSON.stringify(beforeData) === JSON.stringify(afterData))
  }, null)


function clean(data: any) {
  const _data = { ...data }
  removeProperties(_data)
  return _data
}

function removeProperties(data: any) {
  if (data instanceof Object && !(data instanceof Function) && !(data instanceof DocumentReference)) {
    for (const key in data) {
      const value = data[key]
      if (
        key == "__dependencies" ||
        key == "__UUID" ||
        key == "createTime" ||
        key == "updateTime"
      ) {
        delete data[key]
      } else {
        removeProperties(value)
      }
    }
  }
}
