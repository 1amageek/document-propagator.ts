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
      from: "/firstDrafts/{firstID}",
      to: "lang/{lang}/firsts/{firstID}",
      resources: [
        depedencyResource("secondID", "second", "/lang/{lang}/seconds"),
        { documentID: "thirdIDs", field: "thirds", resource: "/lang/{lang}/thirds" }     
      ],
      group: {
        documentID: "lang",
        values: ["ja", "en"]
      }
    },
    {
      from: "/secondDrafts/{secondID}",
      to: "lang/{lang}/seconds/{secondID}",
      resources: [],
      group: {
        documentID: "lang",
        values: ["ja", "en"]
      }
    },
    {
      from: "/thirdDrafts/{thirdID}",
      to: "lang/{lang}/thirds/{thirdID}",
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
