import { Firestore, DocumentSnapshot, DocumentReference, CollectionReference } from "firebase-admin/firestore"
import * as functions from "firebase-functions/v1"
import { RuntimeOptions, SUPPORTED_REGIONS } from "firebase-functions/v1"
import { DependencyResource, Field, getTargetPath, encode } from "./helper"


type DependencyTarget = {
  reference: CollectionReference
  field: Field
}

export class PropagateFunctionBuilder {

  firestore: Firestore

  constructor(firestore: Firestore) {
    this.firestore = firestore
  }

  build(
    options: {
      regions: Array<typeof SUPPORTED_REGIONS[number] | string> | null,
      runtimeOptions?: RuntimeOptions
    } | null,
    triggerResource: string,
    dependencyTargetResources: DependencyResource[]
  ): functions.CloudFunction<functions.Change<functions.firestore.DocumentSnapshot>> {
    let builder = options?.regions != null ? functions.region(...options.regions) : functions
    builder = !!options?.runtimeOptions ? builder.runWith(options.runtimeOptions) : builder
    return builder
      .firestore
      .document(triggerResource)
      .onWrite((change, context) => {
        const dependencyTargets: DependencyTarget[] = dependencyTargetResources.map(target => {
          return { reference: this.firestore.collection(getTargetPath(context.params, triggerResource, target.resource)), field: target.field }
        })
        if (change.before.exists) {
          if (change.after.exists) {
            return onUpdate(this.firestore, dependencyTargets, change.after)
          } else {
            return onDelete(this.firestore, dependencyTargets, change.before)
          }
        }
        return null
      })
  }
}

const onUpdate = async (
  firestore: Firestore,
  dependencyTargets: DependencyTarget[],
  snapshot: DocumentSnapshot,
) => {
  const data = encode(snapshot.data()!)
  const ref = snapshot.ref
  return await resolve(firestore, dependencyTargets, ref, data)
}

const onDelete = async (
  firestore: Firestore,
  dependencyTargets: DependencyTarget[],
  snapshot: DocumentSnapshot,
) => {
  return await resolve(firestore, dependencyTargets, snapshot.ref, null)
}

/**
* Resolve dependencies
* @param dependencyTargets Dependecy Target CollecitonReference
* @param reference DocumentReference
* @param documentData DocumentData
*/
const resolve = async (firestore: Firestore, dependencyTargets: DependencyTarget[], reference: DocumentReference, documentData: any | null) => {
  const tasks = dependencyTargets.map(async (target) => {
    const snapshot = await target.reference.where("__dependencies", "array-contains", reference).get()
    return {
      snapshot: snapshot,
      field: target.field
    }
  })
  const targets = await Promise.all(tasks)
  // const douments = targets.reduce((prev, current) => {
  //   return prev.concat(current.docs)
  // }, [] as QueryDocumentSnapshot<DocumentData>[])
  const bulkWriter = firestore.bulkWriter()

  // If data exists, update it.
  if (documentData) {
    const updateDocumentData = { ...documentData, id: reference.id }
    for (const target of targets) {
      const documents = target.snapshot.docs
      const field = target.field
      for (const doc of documents) {
        const data = doc.data()
        const fieldData = data[field]
        if (Array.isArray(fieldData)) {
          const index = fieldData.findIndex((data) => data.id === reference.id)
          if (index !== -1) {
            fieldData[index] = updateDocumentData
            bulkWriter.update(doc.ref, {
              [field]: fieldData,
            })
          }
        } else {
          bulkWriter.update(doc.ref, {
            [field]: updateDocumentData,
          })
        }
      }
    }
  }
  // If data does not exist, delete
  else {
    for (const target of targets) {
      const documents = target.snapshot.docs
      const field = target.field
      for (const doc of documents) {
        const data = doc.data()
        const fieldData = data[field]
        if (Array.isArray(fieldData)) {
          const index = fieldData.findIndex((data) => data.id === reference.id)
          if (index !== -1) {
            const newFieldData = [...fieldData]
            newFieldData.slice(index, 1)
            bulkWriter.update(doc.ref, {
              [field]: newFieldData,
            })
          }
        }
      }
    }
  }
  return await bulkWriter.close()
}
